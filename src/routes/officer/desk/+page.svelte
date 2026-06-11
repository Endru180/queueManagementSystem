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

	// For Walk-in clients or On-site clients
	let showWalkInForm = false;
	let walkInNik = '';
	let walkInWa = '';
	let walkInServiceType = '';
	let serviceTypes = [];
	let walkInError = '';

	onMount(async () => {
		const raw = localStorage.getItem('officerSession');
		const session = raw ? JSON.parse(raw) : null;

		if (!session || session.role !== 'officer') {
			window.location.href = '/login';
			return;
		}

		officer = session;

		await loadServiceTypes();
		await loadDeskState();
		subscribeRealtime();
	});

	function calculateWMA(queues) {
		const durations = queues
			.filter((q) => q.start_serving_at && q.finish_serving_at) // Filter the data that has both start_serving_at and finish_serving_at
			.map((q) => {
				const start = new Date(q.start_serving_at);
				const finish = new Date(q.finish_serving_at);
				return (finish - start) / 60000; // Getting the duration in MINUTE
			}) // Divided by 60000 because the unit is in ms (milliseconds)
			.filter((d) => d > 0); // Make sure the duration is not 0 or less (negative)

		if (durations.length === 0) return 7; // If there is no any valid duration, return 7 minutes

		// First, calculate the average that will be a threshold for outlier filtering
		const tempAvg = durations.reduce((a, b) => a + b, 0) / durations.length;

		// Second, remove those that exceed 2x the average (outliers)
		const filtered = durations.filter((d) => d <= 2 * tempAvg);

		if (filtered.length === 0) return 7; // If the data becomes empty after the filtering, return 7 minutes as the WMA calculation result

		const latest = filtered.slice(0, 5);

		// WMA = (Σ(duration × weight))/(Σ(weight))
		let weightedTotal = 0; // Σ(duration × weight)
		let weightTotal = 0; // Σ(weight)

		latest.forEach((duration, index) => {
			const weight = latest.length - index; // Example: latest = [5, 6, 7, 8, 9], weight for 5 is 5 - 0 (index of 5) = 5
			weightedTotal += duration * weight; // Σ(duration × weight)
			weightTotal += weight; // Σ(weight)
		});

		return Math.round(weightedTotal / weightTotal); // Return the WMA calculation result
	}

	// Notify the top 3 waiting users via WA
	async function notifyUpcomingQueues() {
		const ids = await getServiceTypeIds();

		// Take the top 3 waiting users from Supabase
		const { data: upcomingQueues } = await supabase
			.from('queues')
			.select('*')
			.eq('status', 'waiting')
			.in('service_type_id', ids)
			.order('queue_number', { ascending: true })
			.limit(3);

		if (!upcomingQueues || upcomingQueues.length === 0) return;

		// For each user that is in top 3, notify them via WA
		for (let i = 0; i < upcomingQueues.length; i++) {
			// upcomingQueues.length is AT MOST 3 (due to .limit(3) above)
			const queue = upcomingQueues[i];
			const estimatedWait = averageMinutes * (i + 1);

			try {
				await fetch('http://localhost:3000/send-whatsapp', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						target: queue.wa_number,
						message: `Queue Update: Your Queue ${queue.queue_number}. Estimated Waiting Time: ${estimatedWait} minutes.`
					})
				});
			} catch (e) {
				console.warn('WhatsApp server not available:', e);
			}
		}
	}

	async function loadServiceTypes() {
		const { data } = await supabase
			.from('service_types')
			.select('*')
			.eq('service_location_id', officer.serviceLocationId);
		serviceTypes = data || [];
	}

	// Has a similar structure with takeQueue() that is for ONLINE client
	async function addWalkInQueue() {
		walkInError = '';

		if (!walkInNik || walkInNik.length !== 16 || !/^\d+$/.test(walkInNik)) {
			walkInError = 'NIK must be 16 digits.';
			return;
		}

		if (!walkInWa || !/^(08|628)\d{8,11}$/.test(walkInWa)) {
			walkInError = 'WhatsApp number is invalid.';
			return;
		}

		if (!walkInServiceType) {
			walkInError = 'Please select service type.';
			return;
		}

		const encoder = new TextEncoder();
		const data = encoder.encode(walkInNik);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const nikHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

		const { data: queueNumber } = await supabase.rpc('get_next_queue_number', {
			loc_id: officer.serviceLocationId
		});

		const { data: newQueue, error } = await supabase
			.from('queues')
			.insert({
				service_type_id: walkInServiceType,
				nik_hash: nikHash,
				wa_number: walkInWa,
				queue_number: queueNumber,
				status: 'waiting'
			})
			.select('*')
			.single();

		if (error) {
			walkInError = 'Failed to add walk-in queue.';
			return;
		}

		try {
			await fetch('http://localhost:3000/send-whatsapp', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					target: newQueue.wa_number,
					message: `Your queue number is ${newQueue.queue_number}`
				})
			});
		} catch (e) {
			console.warn('WhatsApp server not available:', e);
		}

		walkInNik = '';
		walkInWa = '';
		walkInServiceType = '';
		showWalkInForm = false;

		await loadDeskState();
	}

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

		const ids = await getServiceTypeIds();

		registrationOpen = locData?.is_registration_open ?? true;

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
			.limit(10);

		servedQueues = servedData || [];

		// Separate query just for the WMA calculation
		const { data: wmaData } = await supabase
			.from('queues')
			.select('*')
			.in('status', ['served', 'skipped'])
			.in('service_type_id', ids)
			.order('finish_serving_at', { ascending: false })
			.limit(5);

		averageMinutes = calculateWMA(wmaData || []);

		loading = false;
	}

	// Ensure real-time updates from Supabase are reflected on the desk
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
			await loadDeskState();
		}
	}

	async function skipNext() {
		if (!nextQueue) return;

		const now = new Date().toISOString();
		const newSkipCount = (nextQueue.skip_count || 0) + 1;

		if (newSkipCount >= 3) {
			// If the skipped_count is already 3 or more than 3, forfeit the user's queue
			try {
				await fetch('http://localhost:3000/send-whatsapp', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						target: nextQueue.wa_number,
						message: `Your Queue number has been skipped 3 times and removed from the queue. Please register again if you still want to be served.`
					})
				});
			} catch (e) {
				console.warn('WhatsApp server not available:', e);
			}

			await supabase
				.from('queues')
				.update({ status: 'forfeited', skip_count: newSkipCount, finish_serving_at: now })
				.eq('id', nextQueue.id);
		} else {
			// If the skipped_count is still less than 3
			const { data: maxQueue } = await supabase
				.from('queues')
				.select('queue_number')
				.in('service_type_id', await getServiceTypeIds())
				.order('queue_number', { ascending: false })
				.limit(1)
				.single();

			const newQueueNumber = (maxQueue?.queue_number || nextQueue.queue_number) + 3; // Move the user to the number of (maximum queue + 3)

			await supabase
				.from('queues')
				.update({
					status: 'waiting',
					queue_number: newQueueNumber,
					skip_count: newSkipCount,
					finish_serving_at: now
				})
				.eq('id', nextQueue.id);

			try {
				await fetch('http://localhost:3000/send-whatsapp', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						target: nextQueue.wa_number,
						message: `Your queue has been skipped.\nYour new queue number is ${newQueueNumber}.\nPlease be ready when your number is called again.`
					})
				});
			} catch (e) {
				console.warn('WhatsApp server not available:', e);
			}
		}

		await loadDeskState();
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
			// Whether or not a hard case occurred, reset delay_minutes to 0 so the delay
			// doesn't carry over to the next client
			const ids = await getServiceTypeIds();
			await supabase.from('service_types').update({ delay_minutes: 0 }).in('id', ids);

			currentQueue = null;
			await updateAvgDuration();
			await loadDeskState();
			await notifyUpcomingQueues();
		}
	}

	// Once a specific user is served, re-calculate all other users' WMA/estimated time
	// CRUCIAL TO NOTE: this WMA calculation will re-calculate based on 5 latest served clients, not all clients
	async function updateAvgDuration() {
		const ids = await getServiceTypeIds();
		const { data: recentQueues } = await supabase
			.from('queues')
			.select('start_serving_at, finish_serving_at, service_type_id')
			.eq('status', 'served')
			.in('service_type_id', ids)
			.not('start_serving_at', 'is', null)
			.not('finish_serving_at', 'is', null)
			.order('finish_serving_at', { ascending: false })
			.limit(5);

		if (!recentQueues || recentQueues.length === 0) return;

		// Similar with previous WMA calculation code
		const durations = recentQueues.map(
			(q) => (new Date(q.finish_serving_at) - new Date(q.start_serving_at)) / 60000
		);

		const tempAvg = durations.reduce((a, b) => a + b, 0) / durations.length;

		const filtered = durations.filter((d) => d <= 2 * tempAvg);

		if (filtered.length === 0) return;

		// Since we are just using 5 latest served clients, the weights are already assigned from 5 to 1 where 5 is the youngest (most recent) and 1 is the oldest
		const weights = [5, 4, 3, 2, 1];
		let totalWeight = 0;
		let weightedSum = 0;

		filtered.forEach((duration, i) => {
			const weight = weights[i] || 1;
			weightedSum += duration * weight;
			totalWeight += weight;
		});

		const newAvgDuration = Math.round(weightedSum / totalWeight);

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

	// Add 15 minutes buffer for other users' WMA calculation. THIS IS JUST AN AD HOC SOLUTION
	async function hardCase() {
		const confirmed = confirm('Add 15 minutes buffer for all waiting queues?');
		if (!confirmed) return;

		const ids = await getServiceTypeIds();

		await supabase.from('service_types').update({ delay_minutes: 15 }).in('id', ids);
	}

	function logout() {
		localStorage.removeItem('officerSession');
		window.location.href = '/login';
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
			<button class="icon-btn secondary" onclick={logout}>Logout</button>
		</header>

		{#if registrationOpen}
			<button class="outline" onclick={() => (showWalkInForm = !showWalkInForm)}>
				{showWalkInForm ? 'Cancel Walk-in' : 'Add Walk-in'}
			</button>

			{#if showWalkInForm}
				<div class="walk-in-form">
					<input bind:value={walkInNik} placeholder="NIK (16 digits)" />
					<input bind:value={walkInWa} placeholder="WhatsApp Number" />
					<select bind:value={walkInServiceType}>
						<option value="" disabled selected>Select Service Type</option>
						{#each serviceTypes as type (type.id)}
							<option value={type.id}>{type.name}</option>
						{/each}
					</select>
					<button onclick={addWalkInQueue}>Add to Queue</button>

					{#if walkInError}
						<p class="error">{walkInError}</p>
					{/if}
				</div>
			{/if}

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
							<strong>{currentQueue?.wa_number || 'Walk-in Client'}</strong><br />
						</div>
					{/if}

					{#if currentQueue}
						<button class="finish-btn" onclick={finishCurrent}>Finish</button>
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
							<strong>{nextQueue?.wa_number || 'Walk-in Client'}</strong><br />
						</div>
					{/if}

					{#if !currentQueue && nextQueue}
						<button class="serve-btn" onclick={serveNext}>Serve</button>
						<button class="skip-btn" onclick={skipNext}>Skip</button>
					{/if}
				</div>

				<div class="close-box">
					{#if currentQueue}
						<button class="outline warning" onclick={hardCase}>Hard Case</button>
					{/if}
					<button class="outline danger" onclick={() => (showCloseConfirm = true)}>
						Close Registration
					</button>
				</div>
			</section>

			<section class="bottom-grid">
				<article class="served-list">
					<h6>Client Served:</h6>
					<ol>
						{#each servedQueues as item (item.id)}
							<li>
								{item.queue_number} - {item?.wa_number || 'Walk-in Client'}
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

					<button class="reopen-btn" onclick={reopenRegistration}> Reopen Registration </button>
				</div>
			</section>
		{/if}

		{#if showCloseConfirm}
			<div class="overlay">
				<div class="confirm-card">
					<p><strong>Close Registration?</strong></p>
					<div class="confirm-actions">
						<button class="secondary" onclick={() => (showCloseConfirm = false)}>No</button>
						<button class="contrast" onclick={closeRegistration}>Yes</button>
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
		font-family: Arial, Helvetica, sans-serif;
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

	.walk-in-form {
		margin-bottom: 20px;
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
		gap: 1rem;
	}

	.bottom-grid {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 1rem;
		margin-top: 1rem;
		align-items: start;
	}

	.served-list,
	.avg-box,
	.closed-card {
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid #cfcfcf;
		border-radius: 12px;
		padding: 1rem;
		font-family: Arial, Helvetica, sans-serif !important;
		color: black;
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

	.outline {
		width: 100%;
		background: white;
		border: 1px solid #cfcfcf;
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.error {
		color: red;
		font-size: 0.85rem;
		margin-top: 16px;
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

	.warning {
		color: #ff9800;
		border-color: #ff9800;
	}
</style>
