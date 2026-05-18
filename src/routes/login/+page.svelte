<script>
	import { supabase } from '$lib/supabase.js';
	let role = '';
	let email = '';
	let password = '';
	let error = '';

	async function login() {
		error = '';

		if (!role || !email || !password) {
			error = 'Please select role, enter email, and password.';
			return;
		}

		let tableName = role === 'officer' ? 'officers' : 'clients';

		const { data, error: loginError } = await supabase
			.from(tableName)
			.select('*')
			.eq('email', email)
			.eq('password', password)
			.single();

		console.log('table:', tableName);
		console.log('email:', email);
		console.log('data:', data);
		console.log('error:', loginError);

		if (loginError || !data) {
			error = 'Invalid email or password.';
			return;
		}

		localStorage.setItem(
			'userSession',
			JSON.stringify({
				role,
				id: data.id,
				name: data.name,
				email: data.email,
				service_location_id: data.service_location_id || null
			})
		);

		if (role === 'officer') {
			window.location.href = '/officer/desk';
		} else {
			window.location.href = '/';
		}
	}
			
</script>

<main class="login-page">
	<article class="login-card">
		<h2>Login</h2>

		<select bind:value={role}>
			<option value="" disabled selected>Select Profile</option>
			<option value="client">Client</option>
			<option value="officer">Officer</option>
		</select>

		<input bind:value={email} placeholder="Email" />
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
	}

	.error {
		color: red;
		font-size: 0.85rem;
	}
</style>