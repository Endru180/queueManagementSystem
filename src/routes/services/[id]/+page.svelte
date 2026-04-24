<script>
	import { supabase } from '$lib/supabase.js';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let location = null;
	let serviceTypes = [];
	let selectedServiceType = '';
	let nik = '';
	let waNumber = '';
	let loading = false;
	let submitting = false;
	let error = '';

	async function fetchLocation() {
		loading = true;
		const id = $page.params.id;

		const { data } = await supabase.from('service_locations').select('*').eq('id', id).single();

		location = data;

		const { data: types } = await supabase
			.from('service_types')
			.select('*')
			.eq('service_location_id', id);

		serviceTypes = types || [];
		loading = false;
	}

	async function takeQueue() {
		error = '';

		if (!nik || nik.length !== 16 || !/^\d+$/.test(nik)) {
			error = 'NIK must be 16 digits.';
			return;
		}
		if (!waNumber || !/^(08|628)\d{8,11}$/.test(waNumber)) {
			error = 'WhatsApp number must start with 08 or 628 and be 10-13 digits.';
			return;
		}
		if (!selectedServiceType) {
			error = 'Please select a service type.';
			return;
		}

		const confirmed = confirm('Are you sure you want to take a queue?');
		if (!confirmed) return;

		submitting = true;

		const encoder = new TextEncoder();
		const data = encoder.encode(nik);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const nikHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

		// Cek apakah NIK sudah ada di antrian hari ini
		const { data: existing } = await supabase
			.from('queues')
			.select('id')
			.eq('nik_hash', nikHash)
			.eq('status', 'waiting')
			.single();

		if (existing) {
			error = 'You already have an active queue!';
			submitting = false;
			return;
		}

		const { data: queueData } = await supabase.rpc('get_next_queue_number', {
			loc_id: location.id
		});

		const queueNumber = queueData;

		const { data: newQueue, error: insertError } = await supabase
			.from('queues')
			.insert({
				service_type_id: selectedServiceType,
				nik_hash: nikHash,
				wa_number: waNumber,
				queue_number: queueNumber
			})
			.select()
			.single();

		if (insertError) {
			error = 'Failed to take queue. Please try again.';
			submitting = false;
			return;
		}

		const existingIds = JSON.parse(localStorage.getItem('myQueueIds') || '[]');
		existingIds.push(newQueue.id);
		localStorage.setItem('myQueueIds', JSON.stringify(existingIds));
		window.location.href = `/monitor?queueId=${newQueue.id}`;
	}

	onMount(() => {
		fetchLocation();
	});
</script>

{#if loading}
	<main>
		<p>Loading...</p>
	</main>
{:else if location}
	<main>
		<div class="header">
			<button class="back" onclick={() => window.history.back()}>←</button>
			<span>{location.name}</span>
		</div>

		<label for="nik">Enter your NIK</label>
		<input id="nik" type="text" bind:value={nik} placeholder="16 digit NIK" />

		<label for="wa">Enter your WhatsApp Number</label>
		<input id="wa" type="text" bind:value={waNumber} placeholder="e.g. 08123456789" />

		<select bind:value={selectedServiceType}>
			<option value="" disabled selected>Select a service</option>
			{#each serviceTypes as st (st.id)}
				<option value={st.id}>{st.name}</option>
			{/each}
		</select>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button class="take-queue" onclick={takeQueue} disabled={submitting}>
			{submitting ? 'Processing...' : 'Take Queue'}
		</button>
	</main>
{/if}

<style>
	label {
		color: black !important;
	}

	.header span {
		color: black;
	}

	main {
		min-height: 100vh;
		padding: 1rem;
		background: linear-gradient(to bottom, #d0d0d0, #f5f5f5);
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-bottom: 1rem;
		font-weight: bold;
	}

	.back {
		background: white !important;
		border: none !important;
		border-radius: 50% !important;
		width: 36px !important;
		height: 36px !important;
		font-size: 1.1rem !important;
		cursor: pointer !important;
		color: black !important;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-top: 11px;
	}

	label {
		font-weight: bold;
		font-size: 0.95rem;
	}

	input,
	select {
		width: 100%;
	}

	.error {
		color: red;
		font-size: 0.85rem;
		margin: 0;
	}

	.take-queue {
		margin-top: 1rem;
		width: 100%;
		padding: 1rem;
		font-size: 1.2rem;
		font-weight: bold;
		background: white;
		border: 2px solid black;
		border-radius: 16px;
		cursor: pointer;
		color: black !important;
	}

	.take-queue:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
