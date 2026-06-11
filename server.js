// Express forwards the messages to the Fonnte WhatsApp API
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.post('/send-whatsapp', async (req, res) => {
	const { target, message } = req.body;

	try { // Trying to forward the messages first
		const response = await fetch('https://api.fonnte.com/send', {
			method: 'POST',
			headers: {
				Authorization: process.env.FONNTE_TOKEN
			},
			body: new URLSearchParams({
				target,
				message
			})
		});

		const result = await response.json();
		res.json(result);
	} catch (e) { // If it fails, the system will continue without any WA notification
		console.error('Fonnte request failed:', e);
		res.status(500).json({ error: 'WhatsApp service unavailable' });
	}
});

app.listen(3000, () => {
	console.log('WA server running on http://localhost:3000'); // Log a confirmation once the server starts listening
});