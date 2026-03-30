import { supabase } from '$lib/supabase.js';

// Take Current
export async function getCurrentQueue() {
	return await supabase
		.from('queues')
		.select('*')
		.eq('status', 'serving')
		.limit(1)
		.single();
}

// Take Next
export async function getNextQueue() {
	return await supabase
		.from('queues')
		.select('*')
		.eq('status', 'waiting')
		.order('queue_number', { ascending: true })
		.limit(1)
		.single();
}

// Serve Next
export async function serveQueue(queueId, officerId) {
	return await supabase
		.from('queues')
		.update({
			status: 'serving',
			called_at: new Date(),
			officer_id: officerId
		})
		.eq('id', queueId);
}

// Skip
export async function skipQueue(queueId) {
	return await supabase
		.from('queues')
		.update({
			status: 'skipped',
			finished_at: new Date()
		})
		.eq('id', queueId);
}

// Finish
export async function finishQueue(queueId) {
	return await supabase
		.from('queues')
		.update({
			status: 'served',
			finished_at: new Date()
		})
		.eq('id', queueId);
}

// List oF Served
export async function getServedQueues() {
	return await supabase
		.from('queues')
		.select('*')
		.in('status', ['served', 'skipped'])
		.order('finished_at', { ascending: false })
		.limit(5);
}
