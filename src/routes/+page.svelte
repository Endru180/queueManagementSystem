<script>
	import { supabase } from '$lib/supabase.js';
	import { onMount } from 'svelte';

	let provinces = [];
	let cities = [];
	let subdistricts = [];

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

	let showGpsPrompt = false;

	let activeQueues = [];

	onMount(async () => {
		const gpsDone = localStorage.getItem('gpsDone');
		if (!gpsDone) {
			showGpsPrompt = true; 
		} else if (gpsDone === 'denied') {
			gpsDenied = true;
		}
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

	let gpsDenied = false;
	let showToast = false;
	let manualLocation = {
		province: '',
		city: '',
		district: '',
		provinceName: '',
		cityName: '',
		districtName: ''
	};
	let locationConfirmed = false;

	$: locationReady = !gpsDenied || locationConfirmed;

	function confirmLocation() {
		locationConfirmed = true;
		showToast = false;
	}

	function checkAndShowToast() {
		if (manualLocation.province && manualLocation.city && manualLocation.district) {
			showToast = true;
		}
	}

	function onProvinceSelect(e) {
		const opt = e.currentTarget.selectedOptions[0];
		manualLocation.province = opt.value;
		manualLocation.provinceName = opt.text;
		locationConfirmed = false;
		loadCities(opt.value);
		checkAndShowToast();
	}

	function onCitySelect(e) {
		const opt = e.currentTarget.selectedOptions[0];
		manualLocation.city = opt.value;
		manualLocation.cityName = opt.text;
		locationConfirmed = false;
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
		locationConfirmed = false;
		checkAndShowToast();
	}

	function allowGps() {
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				localStorage.setItem('userLat', pos.coords.latitude);
				localStorage.setItem('userLng', pos.coords.longitude);
				localStorage.setItem('gpsDone', 'allowed');
				showGpsPrompt = false;
			},
			() => {
				showGpsPrompt = false;
			}
		);
	}

	function denyGps() {
		gpsDenied = true;
		locationConfirmed = false;
		showGpsPrompt = false;
		localStorage.setItem('gpsDone', 'denied');
		localStorage.removeItem('userLat');
		localStorage.removeItem('userLng');
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
</script>

<!-- Toast -->
{#if showToast}
	<div class="toast">
		<p>
			📍 Location set: {manualLocation.provinceName}, {manualLocation.cityName}, {manualLocation.districtName}
		</p>
		<button onclick={confirmLocation}>Confirm</button>
	</div>
{/if}

<!-- GPS Prompt -->
{#if showGpsPrompt}
	<div class="overlay">
		<div class="prompt-card">
			<p><strong>You have to allow GPS.</strong></p>
			<button onclick={allowGps}>Allow</button>
			<button class="secondary" onclick={denyGps}>Deny</button>
		</div>
	</div>
{/if}

<!-- Main Content -->
<main>
	<select
		disabled={!locationReady}
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

	{#if gpsDenied}
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
	{:else}
		<div class="app-name">
			<p>NamaAplikasinya.com</p>
		</div>
	{/if}
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
		{#if gpsDenied}
			<p class="disclaimer">
				⚠️ Distance is estimated based on subdistrict center, not your exact location.
			</p>
		{/if}
	{/if}
</main>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 999;
	}

	.prompt-card {
		background: white;
		border-radius: 16px;
		padding: 2rem;
		text-align: center;
		width: 80%;
		max-width: 320px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	main {
		min-height: 100vh;
		padding: 1rem;
		background: linear-gradient(to bottom, #d0d0d0, #f5f5f5);
	}

	select {
		width: 100%;
		margin-bottom: 2rem;
	}

	.app-name {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 60vh;
		font-weight: bold;
		font-size: 1.2rem;
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

	.toast button {
		background: white;
		color: #333;
		border: none;
		border-radius: 8px;
		padding: 0.4rem 1rem;
		cursor: pointer;
		font-weight: bold;
	}

	h3 {
		font-weight: bold;
		margin-bottom: 0.5rem;
		color: black;
	}
</style>
