<script>
	import { supabase } from '$lib/supabase.js';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';

	let myQueue = null;
	let currentNumber = null;
	let loading = true;
	let subscription = null;

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
				.select('queue_number')
				.eq('service_type_id', myQueue.service_type_id)
				.eq('status', 'serving')
				.order('queue_number', { ascending: false })
				.limit(1)
				.single();

			currentNumber = serving ? serving.queue_number : null;
		}

		loading = false;
	}

	function subscribeRealtime(queueId) {
		subscription = supabase
			.channel('queue-monitor')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'queues'
				},
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

	$: estimasi = myQueue
		? Math.max(0, myQueue.queue_number - (currentNumber ?? 0)) *
			(myQueue.service_types?.avg_duration ?? 10) +
			(myQueue.service_types?.delay_minutes ?? 0)
		: null;

	$: isNearby = myQueue && myQueue.queue_number - (currentNumber ?? 0) <= 3;

	onMount(() => {
		const queueId = $page.url.searchParams.get('queueId');
		if (queueId) {
			fetchQueueData(queueId);
			subscribeRealtime(queueId);
		}
	});

	onDestroy(() => {
		if (subscription) subscription.unsubscribe();
	});
</script>

{#if loading}
	<main>
		<p>Loading...</p>
	</main>
{:else if myQueue}
	<main>
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

		{#if estimasi !== null}
			<div class="estimation">
				Estimation: <strong>{estimasi} minutes again.</strong>
			</div>
		{/if}

		{#if isNearby}
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

<style>
	main {
		min-height: 100vh;
		padding: 1rem;
		background: linear-gradient(to bottom, #d0d0d0, #f5f5f5);
		display: flex;
		flex-direction: column;
		gap: 1rem;
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
	}

	.number {
		font-size: 3rem;
		font-weight: bold;
	}

	.estimation {
		background: white;
		border: 1px solid #ccc;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		font-style: italic;
		text-align: center;
	}

	.warning {
		background: #e53935;
		color: white;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		text-align: center;
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
</style>
