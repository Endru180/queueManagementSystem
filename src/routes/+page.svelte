<script>
	import { supabase } from '$lib/supabase.js';
	import { onMount } from 'svelte';

	let provinces = [];
	let cities = [];
	let subdistricts = [];
	let checkNik = '';
	let nikCheckError = '';

	async function loadProvinces() {
		const { data } = await supabase.from('provinces').select('*').order('name');
		provinces = data || [];
	}

	async function loadCities(provinceId) {
		const { data } = await supabase
			.from('cities')
			.select('*')
			.eq('province_id', provinceId)
			.order('name');
		cities = data || [];
		subdistricts = [];
	}

	async function loadSubdistricts(cityId) {
		const { data } = await supabase
			.from('subdistricts')
			.select('*')
			.eq('city_id', cityId)
			.order('name');
		subdistricts = data || [];
	}

	let activeQueues = [];

	onMount(async () => {
		loadProvinces();

		const queueIds = JSON.parse(localStorage.getItem('myQueueIds') || '[]');
		if (queueIds.length > 0) {
			const { data } = await supabase
				.from('queues')
				.select('*, service_types(*, service_locations(name, latitude, longitude))')
				.in('id', queueIds)
				.eq('status', 'waiting');
			activeQueues = data || [];
		}
	});

	let showToast = false;
	let manualLocation = {
		province: '',
		city: '',
		district: '',
		provinceName: '',
		cityName: '',
		districtName: ''
	};

	function checkAndShowToast() {
		if (manualLocation.province && manualLocation.city && manualLocation.district) {
			showToast = true;
			setTimeout(() => (showToast = false), 3000);
		}
	}

	function onProvinceSelect(e) {
		const opt = e.currentTarget.selectedOptions[0];
		manualLocation.province = opt.value;
		manualLocation.provinceName = opt.text;
		loadCities(opt.value);
		checkAndShowToast();
	}

	function onCitySelect(e) {
		const opt = e.currentTarget.selectedOptions[0];
		manualLocation.city = opt.value;
		manualLocation.cityName = opt.text;
		loadSubdistricts(opt.value);
		checkAndShowToast();
	}

	function onSubdistrictSelect(e) {
		const opt = e.currentTarget.selectedOptions[0];
		manualLocation.district = opt.value;
		manualLocation.districtName = opt.text;
		const selected = subdistricts.find((d) => String(d.id) === String(opt.value));
		if (selected) {
			localStorage.setItem('userLat', selected.latitude);
			localStorage.setItem('userLng', selected.longitude);
		}
		checkAndShowToast();
	}

	function getDistance(lat1, lng1, lat2, lng2) {
		const R = 6371;
		const dLat = ((lat2 - lat1) * Math.PI) / 180;
		const dLng = ((lng2 - lng1) * Math.PI) / 180;
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos((lat1 * Math.PI) / 180) *
				Math.cos((lat2 * Math.PI) / 180) *
				Math.sin(dLng / 2) *
				Math.sin(dLng / 2);
		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	async function findQueueByNik() {
		nikCheckError = '';

		if (!checkNik || checkNik.length !== 16 || !/^\d+$/.test(checkNik)) {
			nikCheckError = 'NIK must be 16 digits.';
			return;
		}

		const encoder = new TextEncoder();
		const data = encoder.encode(checkNik);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const nikHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

		const { data: found } = await supabase
			.from('queues')
			.select('id')
			.eq('nik_hash', nikHash)
			.eq('status', 'waiting')
			.single();

		if (!found) {
			nikCheckError = 'No active queue found for this NIK.';
			return;
		}

		const existingIds = JSON.parse(localStorage.getItem('myQueueIds') || '[]');
		if (!existingIds.includes(found.id)) {
			existingIds.push(found.id);
			localStorage.setItem('myQueueIds', JSON.stringify(existingIds));
		}

		window.location.href = `/monitor?queueId=${found.id}`;
	}
</script>

<!-- Toast -->
{#if showToast}
	<div class="toast">
		<p>
			📍 Location set: {manualLocation.provinceName}, {manualLocation.cityName}, {manualLocation.districtName}
		</p>
	</div>
{/if}

<!-- Main Content -->
<main>
	<select
		onchange={(e) => {
			const val = e.currentTarget.value;
			if (val) window.location.href = `/services?category=${val}`;
		}}
	>
		<option value="" disabled selected>Select a service</option>
		<option value="Puskesmas">Puskesmas</option>
		<option value="Samsat">Samsat</option>
		<option value="Bank">Bank</option>
		<option value="Kelurahan">Kelurahan</option>
	</select>
	<div class="manual-location">
		<select onchange={onProvinceSelect}>
			<option value="" disabled selected>Select Province</option>
			{#each provinces as p (p.id)}
				<option value={p.id}>{p.name}</option>
			{/each}
		</select>

		<select onchange={onCitySelect}>
			<option value="" disabled selected>Select City/Regency</option>
			{#each cities as c (c.id)}
				<option value={c.id}>{c.name}</option>
			{/each}
		</select>

		<select onchange={onSubdistrictSelect}>
			<option value="" disabled selected>Select Subdistrict</option>
			{#each subdistricts as d (d.id)}
				<option value={d.id}>{d.name}</option>
			{/each}
		</select>
	</div>
	<div class="app-name">
		<p>NamaAplikasinya.com</p>
	</div>
	{#if activeQueues.length > 0}
		<h3>Your Active Queue</h3>
		{#each activeQueues as q (q.id)}
			<button
				class="queue-card"
				onclick={() => (window.location.href = `/monitor?queueId=${q.id}`)}
			>
				<div class="queue-card-left">
					<strong>{q.service_types?.service_locations?.name}</strong>
					<p>{q.service_types?.name} — No. {q.queue_number}</p>
				</div>
				{#if q.service_types?.service_locations}
					{@const loc = q.service_types.service_locations}
					{@const lat = parseFloat(localStorage.getItem('userLat'))}
					{@const lng = parseFloat(localStorage.getItem('userLng'))}
					{#if lat && lng}
						<span class="queue-distance"
							>{getDistance(lat, lng, loc.latitude, loc.longitude).toFixed(1)} km</span
						>
					{/if}
				{/if}
			</button>
		{/each}
		<p class="disclaimer">
			⚠️ Distance is estimated based on subdistrict center, not your exact location.
		</p>
	{/if}
	<div class="nik-check">
		<p>Already have a queue? Enter your NIK:</p>
		<div class="nik-input-row">
			<input type="text" placeholder="Enter your NIK" bind:value={checkNik} maxlength="16" />
			<button onclick={findQueueByNik}>Check</button>
		</div>
		{#if nikCheckError}
			<p class="nik-error">{nikCheckError}</p>
		{/if}
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		padding: 1rem;
		background: linear-gradient(to bottom, #d0d0d0, #f5f5f5);
	}

	select {
		width: 100%;
		margin-bottom: 2rem;
	}

	.queue-card {
		background: white !important;
		border-radius: 16px;
		padding: 1rem 1.2rem;
		margin-bottom: 1rem;
		box-shadow: 4px 4px 0px #00000022;
		cursor: pointer;
		width: 100%;
		text-align: left;
		border: none;
		color: black !important;
		font-size: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.queue-card-left {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.queue-distance {
		font-size: 0.85rem;
		color: #555;
		white-space: nowrap;
		margin-left: 1rem;
	}

	.queue-card p {
		color: #555 !important;
	}

	.nik-check {
		margin-top: 1.5rem;
		padding: 1rem;
		background: white;
		border-radius: 16px;
		box-shadow: 4px 4px 0px #00000022;
	}

	.nik-check p {
		font-size: 0.9rem;
		color: #555;
		margin-bottom: 0.5rem;
	}

	.nik-input-row {
		display: flex;
		gap: 0.5rem;
	}

	.nik-input-row input {
		flex: 1;
		margin-bottom: 0;
	}

	.nik-error {
		color: red;
		font-size: 0.85rem;
		margin-top: 0.5rem;
	}

	.manual-location {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.disclaimer {
		font-size: 0.75rem;
		color: #888;
		text-align: center;
		margin-top: 0.25rem;
	}

	.toast {
		position: fixed;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		background: #333;
		color: white;
		padding: 0.8rem 1.4rem;
		border-radius: 16px;
		font-size: 0.9rem;
		z-index: 1000;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 260px;
	}

	.toast p {
		margin: 0;
	}

	h3 {
		font-weight: bold;
		margin-bottom: 0.5rem;
		color: black;
	}
</style>