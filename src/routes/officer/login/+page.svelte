<script>
	import { supabase } from '$lib/supabase.js';

	let officerId = '';
	let password = '';
	let error = '';

	async function login() {
		error = '';

		if (!officerId || !password) {
			error = 'Officer ID dan password harus diisi.';
			return;
		}

		// Sementara dummy auth
		// Nanti bisa diganti ke Supabase Auth / tabel officers
		if (officerId === 'ABCD' && password === '123456') {
			localStorage.setItem(
				'officerSession',
				JSON.stringify({
					officerId,
					name: 'Christian',
					desk: 'Loket 1',
					location: 'Puskesmas'
				})
			);
			window.location.href = '/officer/desk';
			return;
		}

		error = 'Login gagal.';
	}
</script>

<main class="login-wrap">
	<article class="login-card">
		<h2>Welcome!</h2>

		<input bind:value={officerId} type="text" placeholder="Officer ID" />
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