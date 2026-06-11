<script>
	import { supabase } from '$lib/supabase.js';
	import { onMount } from 'svelte';
	import { browser, dev } from '$app/environment';

	// Only for development process to facilitate the retest process from the beginning
	if (browser && dev) {
		const lastReload = sessionStorage.getItem('devReloaded');

		if (!lastReload) {
			localStorage.clear();
			sessionStorage.setItem('devReloaded', 'true');
		}
	}

	let provinces = [];
	let cities = [];
	let subdistricts = [];

	function logout() {
		localStorage.removeItem('userSession'); // Remove the session
		window.location.href = '/login'; // and get the user back to the login page
	}

	// Loading the provinces data from the previous seeding process into Supabase before
	async function loadProvinces() {
		const { data } = await supabase.from('provinces').select('*').order('name');
		provinces = data || [];
	}

	// Loading the cities data
	async function loadCities(provinceId) {
		const { data } = await supabase
			.from('cities')
			.select('*')
			.eq('province_id', provinceId)
			.order('name');
		cities = data || [];
		subdistricts = [];
	}

	// Then, load the subdistricts data
	async function loadSubdistricts(cityId) {
		const { data } = await supabase
			.from('subdistricts')
			.select('*')
			.eq('city_id', cityId)
			.order('name');
		subdistricts = data || [];
	}

	let activeQueues = []; // For the Active Queues card on User's home page

	onMount(async () => {
		const raw = localStorage.getItem('userSession');
		const session = raw ? JSON.parse(raw) : null;

		if (!session || session.role !== 'client') {
			window.location.href = '/login';
			return;
		}

		loadProvinces();

		const { data } = await supabase
			.from('queues')
			.select('*, service_types(*, service_locations(name, latitude, longitude))')
			.eq('client_id', session.id)
			.eq('status', 'waiting');
		activeQueues = data || [];
	});

	let showToast = false;
	let locationConfirmed = false;
	$: locationReady = locationConfirmed;
	let manualLocation = {
		province: '',
		city: '',
		district: '',
		provinceName: '',
		cityName: '',
		districtName: ''
	};

	// The function that shows toast when all the needed location info already inputted
	function checkAndShowToast() {
		if (manualLocation.province && manualLocation.city && manualLocation.district) {
			showToast = true;
		}
	}

	// Once the button "Confirm" is already pressed, the toast disappears
	function confirmLocation() {
		locationConfirmed = true;
		showToast = false;
	}

	// Get the selected province
	function onProvinceSelect(e) {
		locationConfirmed = false;
		showToast = false;
		const opt = e.currentTarget.selectedOptions[0];
		manualLocation.province = opt.value;
		manualLocation.provinceName = opt.text;
		// Reset downstream selections so a stale toast doesn't show a mismatched location
		manualLocation.city = '';
		manualLocation.cityName = '';
		manualLocation.district = '';
		manualLocation.districtName = '';
		loadCities(opt.value); // From this selected province, load the cities that are in that province
		checkAndShowToast(); // Always check if all the location info already inputted
	}

	// The same logic also works for the selected city and the selected subdistrict
	function onCitySelect(e) {
		locationConfirmed = false;
		showToast = false;
		const opt = e.currentTarget.selectedOptions[0];
		manualLocation.city = opt.value;
		manualLocation.cityName = opt.text;
		manualLocation.district = '';
		manualLocation.districtName = '';
		loadSubdistricts(opt.value);
		checkAndShowToast();
	}

	function onSubdistrictSelect(e) {
		locationConfirmed = false;
		const opt = e.currentTarget.selectedOptions[0];
		manualLocation.district = opt.value;
		manualLocation.districtName = opt.text;
		const selected = subdistricts.find((d) => String(d.id) === String(opt.value));
		if (selected) {
			localStorage.setItem('userLat', selected.latitude);
			localStorage.setItem('userLng', selected.longitude);
		} // Instead of load the villages from the selected subdistrict, just get that subdistrict's latitude and longitude, assuming it is the user's location
		checkAndShowToast();
	}

	// Haversine distance formula
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

<!-- The location confirmation toast -->
{#if showToast}
	<div class="toast">
		<p>
			📍 Location set: {manualLocation.provinceName}, {manualLocation.cityName}, {manualLocation.districtName}
		</p>
		<button onclick={confirmLocation}>Confirm</button>
	</div>
{/if}

<!-- Main Content -->
<main>
	<div class="topbar">
		<button class="logout-btn" onclick={logout}> Logout </button>
	</div>

	<div class="manual-location">
		<!-- Drop down option for provinces, cities, and subdistricts for manual location selection -->
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
	<select
		disabled={!locationReady} // If the user has not filled the province, city, and the subdistrict, disable the services drop down for a while
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

	{#if activeQueues.length > 0}
		<h3>Your Active Queue</h3>
		{#each activeQueues as q (q.id)}
			<button // The active queue card works like a button, the user presses it, then they will go to the Monitor page (/monitor)
				class="queue-card"
				onclick={() => (window.location.href = `/monitor?queueId=${q.id}`)}
			>
				<div class="queue-card-left">
					<strong>{q.service_types?.service_locations?.name}</strong>
					<p>{q.service_types?.name} - No. {q.queue_number}</p>
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
			⚠️ <i>Distance is estimated based on subdistrict center, not your exact location.</i>
		</p>
	{/if}
</main>

<style>
	main {
		min-height: 100vh;
		padding: 1rem 1.5rem 0.1rem 1.5rem;
		background: linear-gradient(to bottom, #d0d0d0, #f5f5f5);
		font-family: Arial, Helvetica, sans-serif;
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
		border: 1.5px solid #cfcfcf !important;
		cursor: pointer;
		width: 100%;
		text-align: left;
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
		font-family: Arial, Helvetica, sans-serif;
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
		font-family: Arial, Helvetica, sans-serif;
	}

	.topbar {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 1rem;
	}

	.logout-btn {
		width: auto;
	}
</style>