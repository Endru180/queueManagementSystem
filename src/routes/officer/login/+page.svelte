<script>
	import { supabase } from '$lib/supabase.js';

	let email = '';
	let password = '';
	let error = '';

	async function login() {
		error = '';

		if (!email || !password) {
			error = 'Officer ID dan password harus diisi.';
			return;
		}

		const { data, error: fetchError } = await supabase
			.from('officers')
			.select('*, service_locations(name)')
			.eq('email', email)
			.eq('password', password)
			.single();

		if (fetchError || !data) {
			console.log('fetchError:', fetchError);
			error = 'Login gagal. Email atau password salah.';
			return;
		}

		localStorage.setItem(
			'officerSession',
			JSON.stringify({
				officerId: data.id,
				name: data.name,
				location: data.service_locations.name,
				serviceLocationId: data.service_location_id
			})
		);

		window.location.href = '/officer/desk';
	}
</script>

<main class="login-wrap">
	<article class="login-card">
		<h2>Welcome!</h2>

		<input bind:value={email} type="text" placeholder="Email" />
		<input bind:value={password} type="password" placeholder="Password" />

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button on:click={login}>Next</button>
	</article>
</main>

<style>
	.login-wrap {
		min-height: 100vh;
		display: grid;
		place-items: center;
		background: linear-gradient(to bottom, #d7d7d7, #f4f4f4);
	}

	.login-card {
		width: min(360px, 90%);
		text-align: center;
		padding: 2rem;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.85);
	}

	h2 {
		margin-bottom: 1.5rem;
	}

	input {
		margin-bottom: 0.75rem;
	}

	.error {
		color: #b00020;
		font-size: 0.9rem;
	}
</style>