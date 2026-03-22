export function loginOfficer(officer) {
	localStorage.setItem('officerSession', JSON.stringify(officer));
}

export function getOfficer() {
	const data = localStorage.getItem('officerSession');
	return data ? JSON.parse(data) : null;
}

export function logoutOfficer() {
	localStorage.removeItem('officerSession');
}
//For Login Temporary
