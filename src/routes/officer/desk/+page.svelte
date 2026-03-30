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

	async function loadDeskState() {
		loading = true;

		// Current serving
		const { data: servingData } = await supabase
			.from('queues')
			.select('*')
			.eq('status', 'serving')
			.eq('service_location_id', 1)
			.order('called_at', { ascending: true })
			.limit(1);

		currentQueue = servingData?.[0] || null;

		// Next waiting
		const { data: nextData } = await supabase
			.from('queues')
			.select('*')
			.eq('status', 'waiting')
			.eq('service_location_id', 1)
			.order('queue_number', { ascending: true })
			.limit(1);

		nextQueue = nextData?.[0] || null;

		// Recently served
		const { data: servedData } = await supabase
			.from('queues')
			.select('*')
			.in('status', ['served', 'skipped'])
			.eq('service_location_id', 1)
			.order('finished_at', { ascending: false })
			.limit(6);

		servedQueues = servedData || [];

		loading = false;
	}

	function subscribeRealtime() {
		supabase
			.channel('officer-queue-channel')
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'queues' },
				async () => {
					await loadDeskState();
				}
			)
			.subscribe();
	}

	async function serveNext() {
		if (!nextQueue) return;

		const now = new Date().toISOString();

		// kalau ada currentQueue aktif, jangan allow serve lagi
		if (currentQueue) return;

		const { error } = await supabase
			.from('queues')
			.update({
				status: 'serving',
				called_at: now,
				officer_id: officer.officerId,
				desk_name: officer.desk
			})
			.eq('id', nextQueue.id);

		if (!error) {
			await loadDeskState();
		}
	}

	async function skipCurrent() {
		if (!currentQueue) return;

		const now = new Date().toISOString();

		const { error } = await supabase
			.from('queues')
			.update({
				status: 'skipped',
				finished_at: now,
				officer_id: officer.officerId
			})
			.eq('id', currentQueue.id);

		if (!error) {
			currentQueue = null;
			await loadDeskState();
		}
	}

	async function finishCurrent() {
		if (!currentQueue) return;

		const now = new Date().toISOString();

		const { error } = await supabase
			.from('queues')
			.update({
				status: 'served',
				finished_at: now,
				officer_id: officer.officerId
			})
			.eq('id', currentQueue.id);

		if (!error) {
			currentQueue = null;
			await loadDeskState();
		}
	}

	async function closeRegistration() {
		registrationOpen = false;
		showCloseConfirm = false;
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
				<strong>{officer?.name}</strong> - {officer?.officerId} - {officer?.location}
			</div>
			<button class="icon-btn secondary" on:click={logout}>Logout</button>
		</header>

		{#if registrationOpen}
			<section class="panel main-grid">
				<div class="queue-box">
					<p class="label">Currently Serving</p>
					<div class="number-box">
						{#if currentQueue}
							{currentQueue.queue_number}
						{:else}
							-
						{/if}
					</div>

					{#if currentQueue}
						<div class="mini-card">
							<strong>{currentQueue.customer_name || 'Tanpa Nama'}</strong><br />
							{currentQueue.phone || '-'}
						</div>
					{/if}

					{#if currentQueue}
						<button class="finish-btn" on:click={finishCurrent}>Finish</button>
					{/if}
				</div>

				<div class="queue-box">
					<p class="label">Next</p>
					<div class="number-box">
						{#if nextQueue}
							{nextQueue.queue_number}
						{:else}
							-
						{/if}
					</div>

					{#if nextQueue}
						<div class="mini-card">
							<strong>{nextQueue.customer_name || 'Tanpa Nama'}</strong><br />
							{nextQueue.phone || '-'}
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
					<button class="outline danger" on:click={() => (showCloseConfirm = true)}>
						Close Registration
					</button>
				</div>
			</section>

			<section class="bottom-grid">
				<article class="served-list">
					<h6>Those who have been served:</h6>
					<ol reversed>
						{#each servedQueues as item}
							<li>
								{item.queue_number} - {item.customer_name || 'Tanpa Nama'} - {item.phone || '-'}
								{#if item.status === 'skipped'} (Skipped){/if}
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
</style>