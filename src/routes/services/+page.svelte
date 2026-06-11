<!-- The page that shows the existing service locations for each service category, such as Puskesmas, Samsat, and so on -->
<script>
	import { supabase } from '$lib/supabase.js';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let category = '';
	let locations = [];
	let userLat = null;
	let userLng = null;
	let loading = false;

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

	function logout() {
		localStorage.removeItem('userSession');
		window.location.href = '/login';
	}

	// Getting the service locations card
	async function fetchLocations() {
		if (!category) return;
		loading = true;

		const cacheKey = `locations_${category}`;
		const cached = localStorage.getItem(cacheKey);
		const cacheTime = localStorage.getItem(`${cacheKey}_time`);
		const isExpired = !cacheTime || Date.now() - cacheTime > 24 * 60 * 60 * 1000;

		let data;
		if (cached && !isExpired) {
			data = JSON.parse(cached);
		} else {
			const { data: fetched } = await supabase
				.from('service_locations')
				.select('*')
				.eq('category', category);
			data = fetched || [];
			localStorage.setItem(cacheKey, JSON.stringify(data));
			localStorage.setItem(`${cacheKey}_time`, Date.now());
		}

		if (userLat && userLng) {
			locations = data
				.map((loc) => ({
					...loc,
					distance: getDistance(userLat, userLng, loc.latitude, loc.longitude)
				}))
				.sort((a, b) => a.distance - b.distance);
		} else {
			locations = data;
		}

		loading = false;
	}

	onMount(() => {
		const raw = localStorage.getItem('userSession');
		const session = raw ? JSON.parse(raw) : null;

		if (!session || session.role !== 'client') {
			window.location.href = '/login';
			return;
		}
		const lat = localStorage.getItem('userLat');
		const lng = localStorage.getItem('userLng');
		if (lat && lng) {
			userLat = parseFloat(lat);
			userLng = parseFloat(lng);
		}

		category = $page.url.searchParams.get('category') || '';
		if (category) fetchLocations();
	});
</script>

<main>
	<div class="topbar">
		<button class="logout-btn" onclick={logout}> Logout </button>
	</div>

	<div class="header">
		<button class="back" onclick={() => window.history.back()}>←</button>
		<span class="category">{category || 'Services'}</span>
	</div>

	<select bind:value={category} onchange={() => fetchLocations()}>
		<option value="" disabled selected>Select a service</option>
		<option value="Puskesmas">Puskesmas</option>
		<option value="Samsat">Samsat</option>
		<option value="Bank">Bank</option>
		<option value="Kelurahan">Kelurahan</option>
	</select>

	{#if loading}
		<p>Loading...</p>
	{:else if locations.length === 0 && category}
		<p>No locations found.</p>
	{:else}
		{#each locations as loc (loc.id)} <!-- Each service location card works like a button, the user clicks it, then they will go to that one specific service location accordingly -->
			<button class="card" onclick={() => (window.location.href = `/services/${loc.id}`)}>
				<div class="card-left">
					<strong>{loc.name}</strong>
					<span class="address">{loc.address}</span>
				</div>
				{#if loc.distance !== undefined} <!-- Hide the distance badge if location's distance has not been calculated yet -->
					<span class="distance">{loc.distance.toFixed(1)} km</span>
				{/if}
			</button>
		{/each}
	{/if}
</main>

<style>
	main {
		min-height: 100vh;
		padding: 1rem;
		background: linear-gradient(to bottom, #d0d0d0, #f5f5f5);
		font-family: Arial, Helvetica, sans-serif;
	}

	select {
		width: 100%;
		margin-bottom: 1.5rem;
	}

	.card {
		background: white;
		border-radius: 16px;
		padding: 1rem 1.2rem;
		margin-bottom: 1rem;
		box-shadow: 4px 4px 0px #00000022;
		border: 1.5px solid #cfcfcf !important;
		cursor: pointer;
		width: 100%;
		text-align: left;
		color: black;
		font-size: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.card-left {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.card strong {
		font-size: 1rem;
	}

	.address {
		font-size: 0.8rem;
		color: #777;
	}

	.distance {
		font-size: 0.85rem;
		color: #555;
		white-space: nowrap;
		margin-left: 1rem;
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

	.category {
		color: black;
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