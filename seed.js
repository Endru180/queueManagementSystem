import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://dihzvokazrcgpqkijnzm.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpaHp2b2thenJjZ3Bxa2lqbnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNjQ4NzAsImV4cCI6MjA4ODk0MDg3MH0.bTDgtbGrXVG1dGrNEjTPTsZF7GNizRFOVR2KggXcC-o'
);

// Data provinsi
const provinces = [
    { id: '31', name: 'DKI Jakarta', latitude: -6.2088, longitude: 106.8456 },
    { id: '32', name: 'Jawa Barat', latitude: -6.9175, longitude: 107.6191 }
];

// Data kota
const cities = [
    { id: '3171', province_id: '31', name: 'Kota Jakarta Pusat', latitude: -6.1862, longitude: 106.8063 },
    { id: '3172', province_id: '31', name: 'Kota Jakarta Utara', latitude: -6.1382, longitude: 106.8698 },
    { id: '3173', province_id: '31', name: 'Kota Jakarta Barat', latitude: -6.1683, longitude: 106.7641 },
    { id: '3174', province_id: '31', name: 'Kota Jakarta Selatan', latitude: -6.2615, longitude: 106.8106 },
    { id: '3175', province_id: '31', name: 'Kota Jakarta Timur', latitude: -6.2250, longitude: 106.9004 },
    { id: '3204', province_id: '32', name: 'Kabupaten Bandung', latitude: -7.0051, longitude: 107.5634 },
    { id: '3273', province_id: '32', name: 'Kota Bandung', latitude: -6.9175, longitude: 107.6191 },
    { id: '3275', province_id: '32', name: 'Kota Bekasi', latitude: -6.2383, longitude: 106.9756 }
];

// Data kecamatan
const districts = [
    // Jakarta Pusat
    { id: '317101', city_id: '3171', name: 'Gambir', latitude: -6.1718, longitude: 106.8243 },
    { id: '317102', city_id: '3171', name: 'Sawah Besar', latitude: -6.1575, longitude: 106.8372 },
    { id: '317103', city_id: '3171', name: 'Kemayoran', latitude: -6.1628, longitude: 106.8561 },
    { id: '317104', city_id: '3171', name: 'Senen', latitude: -6.1769, longitude: 106.8451 },
    { id: '317105', city_id: '3171', name: 'Cempaka Putih', latitude: -6.1769, longitude: 106.8667 },
    // Jakarta Selatan
    { id: '317401', city_id: '3174', name: 'Tebet', latitude: -6.2264, longitude: 106.8499 },
    { id: '317402', city_id: '3174', name: 'Setiabudi', latitude: -6.2124, longitude: 106.8227 },
    { id: '317403', city_id: '3174', name: 'Mampang Prapatan', latitude: -6.2478, longitude: 106.8227 },
    // Kota Bandung
    { id: '327301', city_id: '3273', name: 'Coblong', latitude: -6.8951, longitude: 107.6102 },
    { id: '327302', city_id: '3273', name: 'Cicendo', latitude: -6.9054, longitude: 107.5872 },
    { id: '327303', city_id: '3273', name: 'Bandung Wetan', latitude: -6.9085, longitude: 107.6197 },
    { id: '327304', city_id: '3273', name: 'Sumur Bandung', latitude: -6.9177, longitude: 107.6053 },
    { id: '327305', city_id: '3273', name: 'Andir', latitude: -6.9066, longitude: 107.5769 },
    // Kota Bekasi
    { id: '327501', city_id: '3275', name: 'Bekasi Timur', latitude: -6.2350, longitude: 107.0017 },
    { id: '327502', city_id: '3275', name: 'Bekasi Barat', latitude: -6.2417, longitude: 106.9750 },
    { id: '327503', city_id: '3275', name: 'Bekasi Utara', latitude: -6.2183, longitude: 106.9922 },
    { id: '327504', city_id: '3275', name: 'Bekasi Selatan', latitude: -6.2617, longitude: 106.9922 },
    { id: '327505', city_id: '3275', name: 'Rawalumbu', latitude: -6.2550, longitude: 107.0100 }
];

// Dummy service locations
const serviceLocations = [
    // Jakarta Pusat
    { name: 'Puskesmas Gambir', category: 'Puskesmas', address: 'Jl. Gambir No.1', city_id: '3171', latitude: -6.1718, longitude: 106.8243 },
    { name: 'Samsat Jakarta Pusat', category: 'Samsat', address: 'Jl. Samsat No.1', city_id: '3171', latitude: -6.1575, longitude: 106.8372 },
    // Kota Bandung
    { name: 'Puskesmas Coblong', category: 'Puskesmas', address: 'Jl. Coblong No.1', city_id: '3273', latitude: -6.8951, longitude: 107.6102 },
    { name: 'Puskesmas Cicendo', category: 'Puskesmas', address: 'Jl. Cicendo No.1', city_id: '3273', latitude: -6.9054, longitude: 107.5872 },
    { name: 'Samsat Bandung', category: 'Samsat', address: 'Jl. Samsat No.1', city_id: '3273', latitude: -6.9177, longitude: 107.6053 },
    { name: 'Bank BRI Bandung', category: 'Bank', address: 'Jl. BRI No.1', city_id: '3273', latitude: -6.9085, longitude: 107.6197 },
    // Kota Bekasi
    { name: 'Puskesmas Bekasi Timur', category: 'Puskesmas', address: 'Jl. Bekasi Timur No.1', city_id: '3275', latitude: -6.2350, longitude: 107.0017 },
    { name: 'Samsat Bekasi', category: 'Samsat', address: 'Jl. Samsat No.1', city_id: '3275', latitude: -6.2417, longitude: 106.9750 },
    { name: 'Kelurahan Bekasi Barat', category: 'Kelurahan', address: 'Jl. Kelurahan No.1', city_id: '3275', latitude: -6.2417, longitude: 106.9750 }
];

async function seed() {
    console.log('Seeding provinces...');
    const { error: e1 } = await supabase.from('provinces').upsert(provinces);
    if (e1) console.error('provinces error:', e1.message);

    console.log('Seeding cities...');
    const { error: e2 } = await supabase.from('cities').upsert(cities);
    if (e2) console.error('cities error:', e2.message);

    console.log('Seeding districts...');
    const { error: e3 } = await supabase.from('districts').upsert(districts);
    if (e3) console.error('districts error:', e3.message);

    console.log('Seeding service locations...');
    const { error: e4 } = await supabase.from('service_locations').upsert(serviceLocations);
    if (e4) console.error('service_locations error:', e4.message);

    console.log('Done!');
}

seed();