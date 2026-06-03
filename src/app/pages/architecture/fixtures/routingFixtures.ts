import type { ComponentBlock } from '../components/SystemArchitectureView';
import type { ArchitectureConnectionData as ConnectionData } from '../utils/connectionMapping';

export interface ArchitectureRoutingFixture {
  name: string;
  purpose: string;
  blocks: ComponentBlock[];
  connections: ConnectionData[];
}

function component(id: string, x: number, y: number, category: string, pins: Record<string, string>): ComponentBlock {
  return {
    id,
    reference: id,
    partNumber: id,
    type: category,
    description: category,
    specs: { Category: category, Description: category },
    isIdentified: true,
    isGeneric: false,
    complianceStatus: 'unknown',
    x,
    y,
    connections: [],
    category,
    pinout: Object.fromEntries(
      Object.entries(pins).map(([number, name]) => [
        number,
        { name, type: name.match(/gnd/i) ? 'GROUND' : name.match(/v|bat/i) ? 'POWER' : 'SIGNAL', description: name },
      ]),
    ),
  };
}

export const architectureRoutingFixtures: ArchitectureRoutingFixture[] = [
  {
    name: 'auto-obd-shared-rails',
    purpose: 'Power rails and CAN/LIN fanout should route as readable trunks with short pin taps.',
    blocks: [
      component('VBAT_PROTECT', 0, 0, 'Protection', { '1': 'VBAT_IN', '2': 'VBAT_OUT', '3': 'GND' }),
      component('TPS54328DDAR', 520, -120, 'Voltage Regulators - Switching', { '1': 'EN', '5': 'GND', '6': 'SW', '8': 'VIN' }),
      component('TJA1051TK/3,118', 1040, -120, 'CAN Transceivers', { '1': 'TXD', '4': 'RXD', '6': 'CANL', '7': 'CANH', '8': 'VCC' }),
      component('TJA1027TK/20/1J', 1040, 170, 'LIN Transceivers', { '1': 'LIN', '4': 'GND', '7': 'VBAT', '8': 'VIO' }),
      component('MCP2515T-I/ST', 1450, 0, 'CAN Controllers', { '13': 'SCK', '14': 'SI', '15': 'SO', '18': 'TXCAN', '19': 'RXCAN' }),
    ],
    connections: [
      { id: 'c-vbat-reg', from: 'VBAT_PROTECT', to: 'TPS54328DDAR', type: 'power', signal_name: 'VBAT', source_pin: 'VBAT_OUT', target_pin: 'VIN' },
      { id: 'c-vbat-lin', from: 'VBAT_PROTECT', to: 'TJA1027TK/20/1J', type: 'power', signal_name: 'VBAT', source_pin: 'VBAT_OUT', target_pin: 'VBAT' },
      { id: 'c-can-ctrl', from: 'MCP2515T-I/ST', to: 'TJA1051TK/3,118', type: 'data', signal_name: 'CAN', source_pin: 'TXCAN', target_pin: 'TXD' },
      { id: 'c-can-bus', from: 'TJA1051TK/3,118', to: 'MCP2515T-I/ST', type: 'data', signal_name: 'CAN', source_pin: 'RXD', target_pin: 'RXCAN' },
    ],
  },
  {
    name: 'motor-driver-power-control',
    purpose: 'Switching power path should avoid crossing the driver body while control lines stay compact.',
    blocks: [
      component('LM2596S-5.0', 0, 0, 'Voltage Regulators - Switching', { '1': 'VIN', '2': 'SW', '3': 'GND', '4': 'FB', '5': 'ON/OFF' }),
      component('SRP1265A-100M', 430, -130, 'Inductors', { '1': 'L1', '2': 'L2' }),
      component('DRV8833PWPR', 920, 0, 'Motor Drivers', { '1': 'AIN1', '2': 'AIN2', '8': 'VM', '16': 'GND' }),
      component('ISO7241CDWR', 430, 220, 'Digital Isolators', { '1': 'INA', '2': 'INB', '15': 'OUTA', '16': 'OUTB' }),
    ],
    connections: [
      { id: 'm-sw-l', from: 'LM2596S-5.0', to: 'SRP1265A-100M', type: 'switching', signal_name: 'SW', source_pin: 'SW', target_pin: 'L1' },
      { id: 'm-5v-driver', from: 'LM2596S-5.0', to: 'DRV8833PWPR', type: 'power', signal_name: '5V', source_pin: 'SW', target_pin: 'VM' },
      { id: 'm-iso-a', from: 'ISO7241CDWR', to: 'DRV8833PWPR', type: 'control', signal_name: 'PWM_A', source_pin: 'OUTA', target_pin: 'AIN1' },
      { id: 'm-iso-b', from: 'ISO7241CDWR', to: 'DRV8833PWPR', type: 'control', signal_name: 'PWM_B', source_pin: 'OUTB', target_pin: 'AIN2' },
    ],
  },
  {
    name: 'dense-sensor-bus',
    purpose: 'Many repeated I2C/SPI/data connections should reserve lanes and not collapse into one unreadable stack.',
    blocks: [
      component('STM32F427VIT6', 0, 0, 'Microcontrollers', { '1': 'I2C1_SCL', '2': 'I2C1_SDA', '3': 'SPI1_SCK', '4': 'SPI1_MISO', '5': 'SPI1_MOSI' }),
      component('MPU-6000', 560, -220, 'IMU Sensors', { '1': 'SCL', '2': 'SDA', '3': 'CS', '4': 'SCLK' }),
      component('MS561101BA03-50', 560, 0, 'Pressure Sensors', { '1': 'SCL', '2': 'SDA', '3': 'CSB' }),
      component('FM25V01-G', 560, 220, 'Memory', { '1': 'SCK', '2': 'SI', '3': 'SO', '4': 'CS' }),
    ],
    connections: [
      { id: 'd-i2c-imu-scl', from: 'STM32F427VIT6', to: 'MPU-6000', type: 'data', signal_name: 'I2C1', source_pin: 'I2C1_SCL', target_pin: 'SCL' },
      { id: 'd-i2c-imu-sda', from: 'STM32F427VIT6', to: 'MPU-6000', type: 'data', signal_name: 'I2C1', source_pin: 'I2C1_SDA', target_pin: 'SDA' },
      { id: 'd-i2c-bar-scl', from: 'STM32F427VIT6', to: 'MS561101BA03-50', type: 'data', signal_name: 'I2C1', source_pin: 'I2C1_SCL', target_pin: 'SCL' },
      { id: 'd-i2c-bar-sda', from: 'STM32F427VIT6', to: 'MS561101BA03-50', type: 'data', signal_name: 'I2C1', source_pin: 'I2C1_SDA', target_pin: 'SDA' },
      { id: 'd-spi-fram-sck', from: 'STM32F427VIT6', to: 'FM25V01-G', type: 'data', signal_name: 'SPI1', source_pin: 'SPI1_SCK', target_pin: 'SCK' },
    ],
  },
];
