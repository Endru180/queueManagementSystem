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

		// Validasi input
		if (!nik || nik.length !== 16 || !/^\d+$/.test(nik)) {
			error = 'NIK must be 16 digits.';
			return;
		}
		if (!waNumber || !/^\d+$/.test(waNumber)) {
			error = 'WhatsApp number must be digits only.';
			return;
		}
		if (!selectedServiceType) {
			error = 'Please select a service type.';
			return;
		}

		const confirmed = confirm('Are you sure you want to take a queue?');
		if (!confirmed) return;

		submitting = true;

		// Hash NIK pakai SHA-256
		const encoder = new TextEncoder();
		const data = encoder.encode(nik);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const nikHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

		// Ambil queue number terakhir untuk service type ini
		const { data: lastQueue } = await supabase
			.from('queues')
			.select('queue_number, service_types!inner(service_location_id)')
			.eq('service_types.service_location_id', location.id)
			.in('status', ['waiting', 'serving'])
			.order('queue_number', { ascending: false })
			.limit(1)
			.single();

		const queueNumber = lastQueue ? lastQueue.queue_number + 1 : 1;

		// Insert queue baru
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

		// Simpan queue id ke localStorage lalu redirect ke monitor
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
