import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.post('/send-whatsapp', async (req, res) => {
	const { target, message } = req.body;

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
});

app.listen(3000, () => {
	console.log('WA server running on http://localhost:3000');
});