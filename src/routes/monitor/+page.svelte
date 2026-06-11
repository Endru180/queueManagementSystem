<!-- This is the monitor page for the USER -->
<script>
	import { supabase } from '$lib/supabase.js';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';

	let myQueue = null;
	let currentNumber = null;
	let loading = true;
	let subscription = null;
	let pollingInterval = null;

	let countdown = null;
	let countdownInterval = null;
	let countdownCancelled = false;
	let countdownReason = null;

	// Fetching all the data to be shown on monitor page
	async function fetchQueueData(queueId) {
		const { data: myData } = await supabase
			.from('queues')
			.select('*, service_types(*)')
			.eq('id', queueId)
			.single();

		myQueue = myData;

		if (myQueue) {
			const { data: serving } = await supabase
				.from('queues')
				.select('queue_number, service_types!inner(service_location_id)')
				.eq('service_types.service_location_id', myQueue.service_types.service_location_id)
				.eq('status', 'serving')
				.order('queue_number', { ascending: false }) // Get the highest queue_number among rows that are currently 'serving'
				.limit(1); 

			currentNumber = serving?.[0] ? serving[0].queue_number : null;
		}

		loading = false;
	}

	// Countdown function to let the user stays on the monitor page for 30 seconds, before being taken back to the home page
	function startCountdown() {
		if (countdownInterval) return;
		countdown = 30;
		countdownInterval = setInterval(() => {
			countdown--;
			if (countdown <= 0) {
				clearInterval(countdownInterval);
				countdownInterval = null;
				window.location.href = '/';
			}
		}, 1000);
	}

	// The user may still stay on the monitor page if they want to
	function cancelCountdown() {
		countdownCancelled = true;
		clearInterval(countdownInterval);
		countdownInterval = null;
		countdown = null;
	}

	function subscribeRealtime(queueId) {
		subscription = supabase
			.channel(`queue-monitor-${queueId}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, () => {
				fetchQueueData(queueId);
			})
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'service_types' },
				() => {
					fetchQueueData(queueId);
				}
			)
			.subscribe();
	}

	async function cancelQueue() {
		if (!myQueue) return;
		const confirmed = confirm('Are you sure you want to cancel your queue?');
		if (!confirmed) return;
		await supabase.from('queues').update({ status: 'cancelled' }).eq('id', myQueue.id);
		window.location.href = '/';
	}

	// The condition that must be fulfilled so that user is skipped
	$: isPassed =
		myQueue &&
		currentNumber !== null &&
		currentNumber > myQueue.queue_number &&
		myQueue.status !== 'serving' &&
		myQueue.status !== 'served';

	// The condition if the queue is getting closer
	$: isNearby =
		myQueue &&
		currentNumber !== null &&
		myQueue.queue_number - currentNumber <= 3 &&
		myQueue.queue_number >= currentNumber &&
		myQueue.status !== 'serving';

	// The condition to show the estimated time
	$: estimasi =
		myQueue && !isPassed
			? Math.max(0, myQueue.queue_number - (currentNumber ?? 0)) *
					(myQueue.service_types?.avg_duration ?? 10) +
				(myQueue.service_types?.delay_minutes ?? 0)
			: null;

	$: {
		const reason = myQueue?.status === 'serving' ? 'serving' : isPassed ? 'passed' : null;
		if (reason !== countdownReason) {
			countdownReason = reason;
			if (reason !== null) {
				countdownCancelled = false;
				if (!countdownInterval) startCountdown();
			}
		} else if (reason && !countdownCancelled && !countdownInterval) {
			startCountdown();
		}
	}

	onMount(() => {
		const raw = localStorage.getItem('userSession');
		const session = raw ? JSON.parse(raw) : null;

		if (!session || session.role !== 'client') {
			window.location.href = '/login';
			return;
		}
		const queueId = $page.url.searchParams.get('queueId');
		if (queueId) {
			fetchQueueData(queueId);
			subscribeRealtime(queueId);

			// On every 3 seconds, the browser re-fetches the queue data from Supabase as the mitigation for realtime connection failure
			pollingInterval = setInterval(() => {
				fetchQueueData(queueId);
			}, 3000);
		}
	});

	onDestroy(() => {
		if (subscription) subscription.unsubscribe();
		if (countdownInterval) clearInterval(countdownInterval);
		if (pollingInterval) clearInterval(pollingInterval);
	});
</script>

{#if loading}
	<main>
		<p>Loading...</p>
	</main>
{:else if myQueue}
	{#if myQueue.status === 'forfeited'}
		<main>
			<div class="forfeited-card">
				<h2>❌ Queue Forfeited</h2>
				<p>
					Your queue has been skipped 3 times and removed. Please register again if you still want
					to be served.
				</p>
				<button onclick={() => (window.location.href = '/')}>Back to Home</button>
			</div>
		</main>
	{:else if myQueue.status === 'served'}
		<main>
			<div class="done-card">
				<h2>✅ You've Been Served!</h2>
				<p>Thank you for your patience. We hope to see you again.</p>
				<button onclick={() => (window.location.href = '/')}>Back to Home</button>
			</div>
		</main>
	{:else}
		<main>
			{#if myQueue.status === 'serving'}
				<div class="serving-alert">
					<span>🎉 It's your turn! Please proceed to the service counter now.</span>
					{#if countdown !== null}
						<div class="countdown-row">
							<span class="countdown-text">Redirecting to home in {countdown}s...</span>
							<button class="stay-btn" onclick={cancelCountdown}>Stay</button>
						</div>
					{/if}
				</div>
			{/if}

			{#if isPassed}
				<div class="passed-alert">
					<span
						>⚠️ Your number has already passed. You may have been skipped or already served, but you
						forgot.</span
					>
					{#if countdown !== null}
						<div class="countdown-row">
							<span class="countdown-text">Redirecting to home in {countdown}s...</span>
							<button class="stay-btn" onclick={cancelCountdown}>Stay</button>
						</div>
					{/if}
				</div>
			{/if}

			<div class="numbers">
				<div class="number-box">
					<span class="label">Current Number</span>
					<span class="number">{currentNumber ?? '-'}</span>
				</div>
				<div class="number-box">
					<span class="label">Your Number</span>
					<span class="number">{myQueue.queue_number}</span>
				</div>
			</div>

			{#if myQueue.status === 'serving'}
				<!-- The estimation is hidden because it is already your turn, you do not need to check the estimation time anymore -->
			{:else if currentNumber === null}
				<div class="estimation">The service has not started yet.</div>
			{:else if estimasi !== null}
				<div class="estimation">
					Estimation: <strong>{estimasi} minutes again.</strong>
				</div>
			{/if}

			{#if myQueue.status !== 'serving' && myQueue?.service_types?.delay_minutes > 0}
				<div class="delay-alert">
					Sorry, the officer is handling a case that requires more time. <!-- When Hard Case happens -->
				</div>
			{/if}

			{#if isNearby && myQueue.status !== 'serving'}
				<div class="warning">
					<strong>WARNING</strong>: Stay Alert over the current number
				</div>
			{/if}

			<div class="actions">
				<button class="cancel" onclick={cancelQueue}>Cancel the Queue</button>
				<button class="back" onclick={() => (window.location.href = '/')}>Back</button>
			</div>
		</main>
	{/if}
{/if}

<style>
	main {
		min-height: 100vh;
		padding: 1rem;
		background: linear-gradient(to bottom, #d0d0d0, #f5f5f5);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		font-family: Arial, Helvetica, sans-serif;
	}

	.numbers {
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
	}

	.number-box {
		flex: 1;
		background: white;
		border-radius: 16px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		border: 2px solid black;
	}

	.label {
		font-weight: bold;
		font-size: 0.9rem;
		text-align: center;
		color: black;
	}

	.number {
		font-size: 3rem;
		font-weight: bold;
		color: black;
	}

	.estimation {
		background: white;
		border: 1px solid #ccc;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		font-style: italic;
		text-align: center;
		color: black;
	}

	.warning {
		background: #e53935;
		color: white;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		text-align: center;
	}

	.delay-alert {
		background: #ff9800;
		color: white;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		text-align: center;
		font-size: 0.9rem;
	}

	.serving-alert {
		background: #1f9d55;
		color: white;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		text-align: center;
		font-weight: bold;
		font-size: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.passed-alert {
		background: #f57c00;
		color: white;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		text-align: center;
		font-weight: bold;
		font-size: 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.countdown-row {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.countdown-text {
		font-size: 0.85rem;
		font-weight: normal;
		opacity: 0.9;
	}

	.stay-btn {
		background: white;
		border: none;
		border-radius: 6px;
		padding: 0.2rem 0.75rem;
		font-size: 0.8rem;
		font-weight: bold;
		cursor: pointer;
		color: #333;
	}

	.stay-btn:hover {
		background: #eee;
	}

	.actions {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.cancel {
		width: 100%;
		padding: 1rem;
		background: #e53935;
		color: white !important;
		border: none;
		border-radius: 16px;
		font-size: 1rem;
		font-weight: bold;
		cursor: pointer;
	}

	.back {
		width: 100%;
		padding: 1rem;
		background: white;
		color: black !important;
		border: 2px solid black;
		border-radius: 16px;
		font-size: 1rem;
		cursor: pointer;
	}

	.forfeited-card {
		background: white;
		border-radius: 16px;
		padding: 2rem;
		text-align: center;
		margin: auto 0;
		border: 2px solid #e53935;
	}

	.forfeited-card h2 {
		color: #e53935;
		margin-bottom: 1rem;
	}

	.forfeited-card p {
		color: #e53935;
	}

	.forfeited-card button {
		margin-top: 1rem;
		background: #e53935;
		color: white;
		border: none;
		border-radius: 16px;
		padding: 0.45rem 1.5rem;
		font-size: 1rem;
		font-weight: bold;
		cursor: pointer;
	}

	.forfeited-card button:hover {
		background: #e53935;
	}

	.done-card {
		background: white;
		border-radius: 16px;
		padding: 2rem;
		text-align: center;
		margin: auto 0;
		border: 2px solid #1f9d55;
	}

	.done-card h2 {
		color: #1f9d55;
		margin-bottom: 1rem;
	}

	.done-card p {
		color: #1f9d55;
	}

	.done-card button {
		margin-top: 1rem;
		background: #1f9d55;
		color: white;
		border: none;
		border-radius: 16px;
		padding: 0.45rem 1.5rem;
		font-size: 1rem;
		font-weight: bold;
		cursor: pointer;
	}

	.done-card button:hover {
		background: #178a47;
	}
</style>