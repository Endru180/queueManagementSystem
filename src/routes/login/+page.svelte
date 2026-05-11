<script>
	let role = '';
	let userId = '';
	let password = '';
	let error = '';

	function login() {
		error = '';

		if (!role || !userId || !password) {
			error = 'Please select role and fill ID/password.';
			return;
		}

		// Dummy info
		if (role === 'officer' && userId === 'ABCD' && password === '123456') {
			localStorage.setItem(
				'userSession',
				JSON.stringify({
					role: 'officer',
					id: userId,
					name: 'Officer Demo'
				})
			);

			window.location.href = '/officer/desk';
			return;
		}
        // Dummy info
		if (role === 'client' && userId === 'ABCD' && password === '123456') {
			localStorage.setItem(
				'userSession',
				JSON.stringify({
					role: 'client',
					id: userId,
					name: 'Client Demo'
				})
			);

			window.location.href = '/';
			return;
		}

		error = 'Invalid ID or password.';
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

		<input bind:value={userId} placeholder="ID" />
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