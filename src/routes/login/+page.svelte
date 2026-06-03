<script>
	import { supabase } from '$lib/supabase.js';

	let role = '';
	let identifier = ''; // NIK untuk client, email untuk officer
	let password = '';
	let error = '';

	async function login() {
		error = '';

		if (!role || !identifier || !password) {
			error = 'Please fill in all fields.';
			return;
		}

		if (role === 'client') {
			// Validasi NIK
			if (identifier.length !== 16 || !/^\d+$/.test(identifier)) {
				error = 'NIK must be 16 digits.';
				return;
			}

			// Hash NIK
			const encoder = new TextEncoder();
			const data = encoder.encode(identifier);
			const hashBuffer = await crypto.subtle.digest('SHA-256', data);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const nikHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

			const { data: userData, error: loginError } = await supabase
				.from('clients')
				.select('*')
				.eq('nik_hash', nikHash)
				.eq('password', password)
				.single();

			if (loginError || !userData) {
				error = 'Invalid NIK or password.';
				return;
			}

			localStorage.setItem(
				'userSession',
				JSON.stringify({
					role: 'client',
					id: userData.id,
					nikHash: nikHash
				})
			);

			window.location.href = '/';
		} else {
			const { data: officerData, error: loginError } = await supabase
				.from('officers')
				.select('*, service_locations(name)')
				.eq('email', identifier)
				.eq('password', password)
				.single();

			if (loginError || !officerData) {
				error = 'Invalid email or password.';
				return;
			}

			localStorage.setItem(
				'officerSession',
				JSON.stringify({
					role: 'officer',
					officerId: officerData.id,
					name: officerData.name,
					location: officerData.service_locations.name,
					serviceLocationId: officerData.service_location_id
				})
			);

			window.location.href = '/officer/desk';
		}
	}
</script>

<main class="login-page">
	<article class="login-card">
		<h3>Local Queue Management System (LQMS)</h3>
		<h4>Login</h4>

		<select bind:value={role}>
			<option value="" disabled selected>Select Profile</option>
			<option value="client">Client</option>
			<option value="officer">Officer</option>
		</select>

		<input bind:value={identifier} placeholder={role == 'officer' ? 'Email' : 'NIK (16 digits)'} />
		<input bind:value={password} type="password" placeholder="Password" />

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button onclick={login}>Login</button>
	</article>
</main>

<style>
	.login-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		background: linear-gradient(to bottom, #d0d0d0, #f5f5f5);
		padding: 1rem;
	}

	.login-card {
		width: 100%;
		max-width: 360px;
		background: white;
		border-radius: 16px;
		padding: 1.5rem;
		font-family: Arial, Helvetica, sans-serif !important;
	}

	.login-card h3,
	.login-card h4 {
		color: black;
		font-family: Arial, Helvetica, sans-serif !important;
	}

	.error {
		color: red;
		font-size: 0.85rem;
	}
</style>