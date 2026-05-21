<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';

	let officer = null;
	let currentQueue = null;
	let nextQueue = null;
	let servedQueues = [];
	let averageMinutes = 7;
	let registrationOpen = true;
	let loading = true;
	let showCloseConfirm = false;

	onMount(async () => {
		const raw = localStorage.getItem('officerSession');
		if (!raw) {
			window.location.href = '/officer/login';
			return;
		}

		officer = JSON.parse(raw);
		await loadDeskState();
		subscribeRealtime();
	});

	async function getServiceTypeIds() {
		const { data } = await supabase
			.from('service_types')
			.select('id')
			.eq('service_location_id', officer.serviceLocationId);
		return data?.map((st) => st.id) || [];
	}

	async function loadDeskState() {
		loading = true;

		// Checking registration status
		const { data: locData } = await supabase
			.from('service_locations')
			.select('is_registration_open')
			.eq('id', officer.serviceLocationId)
			.single();

		registrationOpen = locData?.is_registration_open ?? true;
		const ids = await getServiceTypeIds();

		// Current serving
		const { data: servingData } = await supabase
			.from('queues')
			.select('*')
			.eq('status', 'serving')
			.in('service_type_id', ids)
			.order('start_serving_at', { ascending: true })
			.limit(1);

		currentQueue = servingData?.[0] || null;

		// Next waiting
		const { data: nextData } = await supabase
			.from('queues')
			.select('*')
			.eq('status', 'waiting')
			.in('service_type_id', ids)
			.order('queue_number', { ascending: true })
			.limit(1);

		nextQueue = nextData?.[0] || null;

		// Recently served
		const { data: servedData } = await supabase
			.from('queues')
			.select('*')
			.in('status', ['served', 'skipped'])
			.in('service_type_id', ids)
			.order('finish_serving_at', { ascending: false })
			.limit(6);

		servedQueues = servedData || [];

		loading = false;
	}

	function subscribeRealtime() {
		supabase
			.channel('officer-queue-channel')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, async () => {
				await loadDeskState();
			})
			.subscribe();
	}

	async function serveNext() {
		if (!nextQueue) return;
		if (currentQueue) return;

		const now = new Date().toISOString();

		const { error } = await supabase
			.from('queues')
			.update({
				status: 'serving',
				start_serving_at: now
			})
			.eq('id', nextQueue.id);

		if (!error) {
			// Cek apakah ada skipped queue yang perlu di-requeue
			// Ambil queue number saat ini
			const currentQueueNumber = nextQueue.queue_number;

			// Cari skipped queues yang di-skip sebelum 3 orang lalu
			const { data: skippedQueues } = await supabase
				.from('queues')
				.select('*')
				.eq('status', 'skipped')
				.lt('queue_number', currentQueueNumber - 3);

			if (skippedQueues && skippedQueues.length > 0) {
				// Ambil queue number tertinggi saat ini
				const { data: lastQueue } = await supabase.rpc('get_next_queue_number', {
					loc_id: officer.serviceLocationId
				});

				// Requeue — set status waiting dengan nomor baru
				for (const sq of skippedQueues) {
					await supabase
						.from('queues')
						.update({
							status: 'waiting',
							queue_number: lastQueue,
							skip_count: sq.skip_count
						})
						.eq('id', sq.id);
				}
			}

			await loadDeskState();
		}
	}

	async function skipCurrent() {
		if (!currentQueue) return;

		const now = new Date().toISOString();
		const newSkipCount = (currentQueue.skip_count || 0) + 1;
		const newStatus = newSkipCount >= 3 ? 'forfeited' : 'skipped';

		const { error } = await supabase
			.from('queues')
			.update({
				status: newStatus,
				skip_count: newSkipCount,
				finish_serving_at: now
			})
			.eq('id', currentQueue.id);

		if (!error) {
			currentQueue = null;
			await loadDeskState();
		}
	}

	async function hardCase() {
		const confirmed = confirm('Add 15 minutes buffer for all waiting queues?');
		if (!confirmed) return;

		const ids = await getServiceTypeIds();

		await supabase.from('service_types').update({ delay_minutes: 15 }).in('id', ids);
	}

	async function finishCurrent() {
		if (!currentQueue) return;

		const now = new Date().toISOString();

		const { error } = await supabase
			.from('queues')
			.update({
				status: 'served',
				finish_serving_at: now
			})
			.eq('id', currentQueue.id);

		if (!error) {
			currentQueue = null;
			await updateAvgDuration();
			await loadDeskState();
		}
	}

	async function updateAvgDuration() {
		// Ambil 5 sesi terakhir yang sudah selesai
		const { data: recentQueues } = await supabase
			.from('queues')
			.select('start_serving_at, finish_serving_at, service_type_id')
			.eq('status', 'served')
			.not('start_serving_at', 'is', null)
			.not('finish_serving_at', 'is', null)
			.order('finish_serving_at', { ascending: false })
			.limit(5);

		if (!recentQueues || recentQueues.length === 0) return;

		// Hitung rata-rata sementara dulu
		const durations = recentQueues.map(
			(q) => (new Date(q.finish_serving_at) - new Date(q.start_serving_at)) / 60000
		);

		const tempAvg = durations.reduce((a, b) => a + b, 0) / durations.length;

		// Filter outlier — hapus durasi yang melebihi 2x rata-rata
		const filtered = durations.filter((d) => d <= 2 * tempAvg);

		if (filtered.length === 0) return;

		// Hitung WMA dari data yang sudah difilter
		const weights = [5, 4, 3, 2, 1];
		let totalWeight = 0;
		let weightedSum = 0;

		filtered.forEach((duration, i) => {
			const weight = weights[i] || 1;
			weightedSum += duration * weight;
			totalWeight += weight;
		});

		const newAvgDuration = Math.round(weightedSum / totalWeight);

		// Update avg_duration di service_types
		await supabase
			.from('service_types')
			.update({ avg_duration: newAvgDuration })
			.eq('service_location_id', officer.serviceLocationId);

		averageMinutes = newAvgDuration;
	}

	async function closeRegistration() {
		await supabase
			.from('service_locations')
			.update({ is_registration_open: false })
			.eq('id', officer.serviceLocationId);

		registrationOpen = false;
		showCloseConfirm = false;
	}

	async function reopenRegistration() {
		await supabase
			.from('service_locations')
			.update({ is_registration_open: true })
			.eq('id', officer.serviceLocationId);

		registrationOpen = true;
	}

	function logout() {
		localStorage.removeItem('officerSession');
		window.location.href = '/officer/login';
	}
</script>

{#if loading}
	<main class="page"><p>Loading...</p></main>
{:else}
	<main class="page">
		<header class="topbar">
			<div>
				<strong>{officer?.name}</strong> - {officer?.location}
			</div>
			<button class="icon-btn secondary" on:click={logout}>Logout</button>
		</header>

		{#if registrationOpen}
			<section class="panel main-grid">
				<div class="queue-box">
					<p class="label">Serving</p>
					<div class="number-box">
						{#if currentQueue}
							{currentQueue.queue_number}
						{:else}
							-
						{/if}
					</div>

					{#if currentQueue}
						<div class="mini-card">
							<strong>{currentQueue.nik_hash || 'No NIK'}</strong><br />
							{currentQueue.wa_number || '-'}
						</div>
					{/if}

					{#if currentQueue}
						<button class="finish-btn" on:click={finishCurrent}>Finish</button>
					{/if}
				</div>

				<div class="queue-box">
					<p class="label">Next Queue</p>
					<div class="number-box">
						{#if nextQueue}
							{nextQueue.queue_number}
						{:else}
							-
						{/if}
					</div>

					{#if nextQueue}
						<div class="mini-card">
							<strong>{nextQueue.nik_hash || 'No NIK'}</strong><br />
							{nextQueue.wa_number || '-'}
						</div>
					{/if}

					{#if !currentQueue && nextQueue}
						<button class="serve-btn" on:click={serveNext}>Serve</button>
					{/if}

					{#if currentQueue}
						<button class="skip-btn" on:click={skipCurrent}>Skip</button>
					{/if}
				</div>

				<div class="close-box">
					{#if currentQueue}
						<button class="outline warning" on:click={hardCase}> Hard Case </button>
					{/if}
					<button class="outline danger" on:click={() => (showCloseConfirm = true)}>
						Close Registration
					</button>
				</div>
			</section>

			<section class="bottom-grid">
				<article class="served-list">
					<h6>Client Served:</h6>
					<ol reversed>
						{#each servedQueues as item (item.id)}
							<li>
								{item.queue_number} - {item.nik_hash || 'No NIK'} - {item.wa_number || '-'}
								{#if item.status === 'skipped'}
									(Skipped)
								{/if}
							</li>
						{/each}
					</ol>
				</article>

				<article class="avg-box">
					Average duration/person<br />
					<strong>{averageMinutes} minutes/person</strong>
				</article>
			</section>
		{:else}
			<section class="closed-wrap">
				<div class="closed-card">
					<h2>CLOSED</h2>
					<p>You have closed the registration.</p>

					<button class="reopen-btn" on:click={reopenRegistration}> Reopen Registration </button>
				</div>
			</section>
		{/if}

		{#if showCloseConfirm}
			<div class="overlay">
				<div class="confirm-card">
					<p><strong>Close Registration?</strong></p>
					<div class="confirm-actions">
						<button class="secondary" on:click={() => (showCloseConfirm = false)}>No</button>
						<button class="contrast" on:click={closeRegistration}>Yes</button>
					</div>
				</div>
			</div>
		{/if}
	</main>
{/if}

<style>
	.page {
		min-height: 100vh;
		padding: 1rem;
		background: linear-gradient(to bottom, #d7d7d7, #f4f4f4);
		color: #222;
	}

	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		font-size: 0.95rem;
	}

	.main-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		align-items: start;
	}

	.queue-box {
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid #cfcfcf;
		border-radius: 12px;
		padding: 1rem;
		text-align: center;
	}

	.label {
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
		color: #444;
	}

	.number-box {
		font-size: 4rem;
		line-height: 1;
		background: white;
		border: 1px solid #bbb;
		border-radius: 10px;
		padding: 1rem;
		min-height: 120px;
		display: grid;
		place-items: center;
		margin-bottom: 0.75rem;
	}

	.mini-card {
		font-size: 0.8rem;
		border: 1px solid #ccc;
		padding: 0.4rem 0.5rem;
		border-radius: 8px;
		background: white;
		margin-bottom: 0.75rem;
	}

	.serve-btn,
	.skip-btn,
	.finish-btn {
		width: 100%;
		margin-top: 0.25rem;
	}

	.serve-btn {
		background: #1f9d55;
		border-color: #1f9d55;
	}

	.skip-btn {
		background: #d62828;
		border-color: #d62828;
	}

	.finish-btn {
		background: #1d7ddc;
		border-color: #1d7ddc;
	}

	.warning {
		color: #ff9800;
		border-color: #ff9800;
	}

	.close-box {
		grid-column: 1 / -1;
		display: flex;
		justify-content: flex-end;
	}

	.bottom-grid {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 1rem;
		margin-top: 1rem;
	}

	.served-list,
	.avg-box,
	.closed-card {
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid #cfcfcf;
		border-radius: 12px;
		padding: 1rem;
	}

	.served-list ol {
		margin: 0.5rem 0 0 1rem;
		font-size: 0.85rem;
	}

	.avg-box {
		text-align: center;
		display: grid;
		place-items: center;
		font-size: 0.9rem;
	}

	.closed-wrap {
		min-height: 70vh;
		display: grid;
		place-items: center;
	}

	.closed-card {
		text-align: center;
		width: min(420px, 90%);
	}

	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		display: grid;
		place-items: center;
	}

	.confirm-card {
		background: white;
		padding: 1.5rem;
		border-radius: 14px;
		width: min(320px, 90%);
		text-align: center;
	}

	.confirm-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		margin-top: 1rem;
	}

	@media (max-width: 768px) {
		.main-grid,
		.bottom-grid {
			grid-template-columns: 1fr;
		}

		.close-box {
			justify-content: stretch;
		}
	}

	.reopen-btn {
		margin-top: 1rem;
		width: 100%;
	}
</style>