const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const firmwareSelect = document.getElementById('firmwareSelect');
const updateButton = document.getElementById('updateButton');
const logArea = document.getElementById('log');
const firmwareSelectionDiv = document.querySelector('.firmware-selection');

let device;
let otaService;
let otaControlCharacteristic;
let otaDataCharacteristic;

const OTA_SERVICE_UUID = 'abcd'; // เปลี่ยนเป็น UUID ของคุณ
const OTA_CONTROL_CHAR_UUID = 'abce'; // เปลี่ยนเป็น UUID ของคุณ
const OTA_DATA_CHAR_UUID = 'abcf'; // เปลี่ยนเป็น UUID ของคุณ

const firmwareFiles = [
    'firmware_v1.0.bin',
    'firmware_v1.1.bin',
    'firmware_v1.2.bin'
];

function log(message) {
    logArea.value += message + '\n';
    logArea.scrollTop = logArea.scrollHeight;
}

// Populate firmware dropdown
function populateFirmwareDropdown() {
    firmwareSelect.innerHTML = '';
    firmwareFiles.forEach(file => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file;
        firmwareSelect.appendChild(option);
    });
}

connectButton.addEventListener('click', async () => {
    try {
        log('Requesting Bluetooth device...');
        device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [OTA_SERVICE_UUID] }],
            optionalServices: [OTA_SERVICE_UUID]
        });

        log('Connecting to GATT Server...');
        const server = await device.gatt.connect();

        log('Getting OTA Service...');
        otaService = await server.getPrimaryService(OTA_SERVICE_UUID);

        log('Getting OTA Control Characteristic...');
        otaControlCharacteristic = await otaService.getCharacteristic(OTA_CONTROL_CHAR_UUID);

        log('Getting OTA Data Characteristic...');
        otaDataCharacteristic = await otaService.getCharacteristic(OTA_DATA_CHAR_UUID);

        log('Connected to ESP32!');
        connectButton.style.display = 'none';
        disconnectButton.style.display = 'inline-block';
        firmwareSelectionDiv.style.display = 'block';
        populateFirmwareDropdown();

        device.addEventListener('gattserverdisconnected', onDisconnected);
    } catch (error) {
        log(`Error: ${error}`);
    }
});

disconnectButton.addEventListener('click', () => {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
    }
});

function onDisconnected() {
    log('Disconnected from ESP32.');
    connectButton.style.display = 'inline-block';
    disconnectButton.style.display = 'none';
    firmwareSelectionDiv.style.display = 'none';
}

updateButton.addEventListener('click', async () => {
    const selectedFirmware = firmwareSelect.value;
    if (!selectedFirmware) {
        log('Please select a firmware file.');
        return;
    }

    try {
        log(`Starting OTA update with: ${selectedFirmware}`);
        const firmwareUrl = `./firmwares/${selectedFirmware}`; // Path relative to GitHub Pages
        const response = await fetch(firmwareUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch firmware: ${response.statusText}`);
        }
        const firmwareBuffer = await response.arrayBuffer();
        const firmwareData = new Uint8Array(firmwareBuffer);

        log('Sending START_OTA command...');
        await otaControlCharacteristic.writeValue(new TextEncoder().encode('START_OTA'));

        const chunkSize = 256; // Adjust chunk size based on your BLE MTU and ESP32 buffer
        let offset = 0;

        log(`Firmware size: ${firmwareData.length} bytes`);

        while (offset < firmwareData.length) {
            const end = Math.min(offset + chunkSize, firmwareData.length);
            const chunk = firmwareData.slice(offset, end);
            await otaDataCharacteristic.writeValueWithoutResponse(chunk);
            log(`Sent ${end} / ${firmwareData.length} bytes`);
            offset = end;
            // You might need a small delay here depending on the ESP32's processing speed
            // await new Promise(resolve => setTimeout(resolve, 5));
        }

        log('Sending END_OTA command...');
        await otaControlCharacteristic.writeValue(new TextEncoder().encode('END_OTA'));
        log('OTA update complete! ESP32 should reboot with new firmware.');

    } catch (error) {
        log(`OTA Error: ${error}`);
    }
});
