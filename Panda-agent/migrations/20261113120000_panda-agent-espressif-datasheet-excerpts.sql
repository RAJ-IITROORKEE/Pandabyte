-- Requested by the owner on 13 Nov 2026 ("find their Espressif documents ... and ingest that document as well"). Adds curated
-- excerpts of the five Espressif module datasheets linked from the PandaByte product pages, as version scope 'technical' under
-- the existing product sources (xC3, xC3m, x32, xLoRa, xC5, xC6, xS3). Excerpt text: prose copied from the PDF; tables transcribed
-- from the rendered pages and number-checked against the PDF text layer (Panda-agent/docs/datasheet-excerpts/). Short cited
-- excerpts only; vendor text is excluded from the anonymous public catalog functions.
-- Applied as separate idempotent statements ("-- @@split"). Inert until 20261113120001 switches the runtime pin.
-- Rollback: readers do not reference the new rows until the switch; the public-passages filter and the 'technical' scope
-- admission can be reverted by the inverse replace (they change nothing while no technical row is in the live release).
DO $m$
DECLARE d text;
BEGIN
 d := pg_get_functiondef('public.panda_agent_runtime_eligible(uuid)'::regprocedure);
 IF position('v.scope IN (''product_listing'',''technical'')' IN d)=0 THEN
  IF position('v.scope=''product_listing''' IN d)=0 THEN RAISE EXCEPTION 'eligible anchor not found'; END IF;
  EXECUTE replace(d,'v.scope=''product_listing''','v.scope IN (''product_listing'',''technical'')');
 END IF;
 -- The anonymous catalog read keeps listing text only (no vendor datasheet text).
 d := pg_get_functiondef('public.panda_agent_public_passages(text)'::regprocedure);
 IF position('tv.scope<>''product_listing''' IN d)=0 THEN
  IF position('AND logical_chunk_id NOT IN (' IN d)=0 THEN RAISE EXCEPTION 'public anchor not found'; END IF;
  EXECUTE replace(d,'AND logical_chunk_id NOT IN (','AND NOT EXISTS (SELECT 1 FROM public.panda_agent_versions tv WHERE tv.id=document_version_id AND tv.scope<>''product_listing'') AND logical_chunk_id NOT IN (');
 END IF;
 d := pg_get_functiondef('public.panda_agent_runtime_admin_snapshot()'::regprocedure);
 IF position('n>700' IN d)=0 THEN
  IF position('n>290' IN d)=0 THEN RAISE EXCEPTION 'snapshot cap not found'; END IF;
  EXECUTE replace(d,'n>290','n>700');
 END IF;
END $m$;
-- @@split
DO $m$ BEGIN
 PERFORM public.panda_agent_store_version('1632b696-9004-4f85-8aac-24be058c5cc1','9d954070-b054-4d45-af0c-27a2e3aa4f0a','5638c86c-6817-433a-abf3-1abee8d3eff6',NULL,'433ac5952e4a91f29c42398160e353d0e062fa01ba00852993849a04187348f1','622db737a711a75e89185aed850f3854c77d515c32ddf0ba9886653663cfdabe',952496,$t${"document":"ESP32-C3-WROOM-02 Datasheet","version":"v1.7, 2026-03-05","source_url":"https://documentation.espressif.com/esp32-c3-wroom-02_datasheet_en.pdf","pdf_sha256":"622db737a711a75e89185aed850f3854c77d515c32ddf0ba9886653663cfdabe","excerpts":[{"key":"overview-features","sha256":"4cdb1e4e3703b37bd50b61513b4419cdb17e49c79c3cfaf42d97beba0b683505"},{"key":"pin-definitions","sha256":"529c64e5bd300fa958f169957b1ccc7e42140e17f2dbf838d7afebde9f9d9d14"},{"key":"strapping-pins","sha256":"872397ec4bc69360421beefaa47a811f9eac282c6fc80665fcf1756dce94c339"},{"key":"boot-mode","sha256":"5989defd8070cb6ced53eb75694ce8b2aa5953093d4369a9615b7c4328524902"},{"key":"module-variants","sha256":"7903f86b0ab223cb9e9e03decc533a55e465a83ab2720fa4bd229c22b54faea1"},{"key":"variant-notes","sha256":"2e91c379f5fafb4a73f6c70b90f140579832e4c5134c49fe1bced4bd9f444196"},{"key":"electrical-ratings","sha256":"35ab3954f99712735a2460dda1528b0149f90af30546225e95751b61a50fffb6"},{"key":"dc-characteristics","sha256":"d50ded2c09a124354db9dbcc4dfedd3a0635f114c87173c9ba2d46953c87a525"},{"key":"current-wifi-active","sha256":"79f6e48cdad14be6b00efd9eaea3e24c9df9f838b6c7bb0e5848c45c02178e91"},{"key":"current-sleep-modes","sha256":"7779ef481d55096dc70ee70547161338fac0fb565d02dcf5b6f3d54a96ef5726"},{"key":"wifi-rf","sha256":"a4f280b80841fef778a70c311f1c2b482daf906adc1555b4a068a9f1e29eaae4"},{"key":"ble-rf","sha256":"cfa39c01c2583c99b0c448bf3a86abef98c56af343ac97830194327373f8b78d"},{"key":"peripherals-uart-spi","sha256":"a29cd7dacf7559efc1bb1afce1b56a137cec38f95ee61377801c836602b0b0be"},{"key":"peripherals-i2c-i2s-usb","sha256":"3c852c53e1df2863fe839bb35a7815b18d943984af30c4574d7c42a001b8f497"}]}$t$,'68386d5d95d6890f8ddac6f45dd282c0db34e37dcfa71f57ebba57f41bc141df','espressif-datasheet-excerpts-v1','386403f66ddfed7a20e2d02758e9bff83e6fd757cb34a89c208a52f03212b384','technical',NULL,'{"captured_at":"2026-11-13T00:00:00+00:00","rights":"vendor_datasheet_short_cited_excerpts_only","copyright_holder":"Espressif Systems","original_url":"https://documentation.espressif.com/esp32-c3-wroom-02_datasheet_en.pdf","document":"ESP32-C3-WROOM-02 Datasheet","document_version":"v1.7, 2026-03-05","method":"excerpts selected from the PDF text layer; tables transcribed from rendered pages and number-checked; owner requested 2026-11-13"}'::jsonb);
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='1632b696-9004-4f85-8aac-24be058c5cc1' AND artifact_key='433ac5952e4a91f29c42398160e353d0e062fa01ba00852993849a04187348f1';
 FOR r IN SELECT * FROM (VALUES
 ('overview-features','Module overview and features','[2]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Module overview and features. Page: 2. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features**

**CPU and On-Chip Memory**
- ESP32-C3 embedded, 32-bit RISC-V single-core processor, up to 160 MHz
- 384 KB ROM
- 400 KB SRAM (16 KB for cache)
- 8 KB SRAM in RTC

**Wi-Fi**
- IEEE 802.11b/g/n-compliant
- Center frequency range of operating channel: 2412 ~ 2484 MHz
- Supports 20 MHz, 40 MHz bandwidth in 2.4 GHz band
- 1T1R mode with data rate up to 150 Mbps
- Wi-Fi Multimedia (WMM)
- TX/RX A-MPDU, TX/RX A-MSDU
- Immediate Block ACK
- Fragmentation and defragmentation
- Transmit opportunity (TXOP)
- Automatic Beacon monitoring (hardware TSF)
- 4 × virtual Wi-Fi interfaces

**Bluetooth®**
- Bluetooth LE: Bluetooth 5, Bluetooth mesh
- Speed: 125 Kbps, 500 Kbps, 1 Mbps, 2 Mbps
- Advertising extensions
- Multiple advertisement sets
- Channel selection algorithm #2
- Internal co-existence mechanism between Wi-Fi and Bluetooth to share the same antenna

**Peripherals**
- Up to 15 GPIOs
  - 3 strapping GPIOs
- SPI, UART, I2C, I2S, remote control peripheral, LED PWM controller, general DMA controller, TWAI® controller (compatible with ISO 11898-1, i.e. CAN Specification 2.0), USB Serial/JTAG controller, temperature sensor, SAR ADC, general-purpose timers, watchdog timers

Note: * Please refer to ESP32-C3 Series Datasheet for detailed information about the module peripherals.$t$),
 ('pin-definitions','Pin definitions','[10,11]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Pin definitions. Pages: 10, 11. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3-1. Pin Definitions**

| Name | No. | Type (note 1) | Function |
|---|---|---|---|
| 3V3 | 1 | P | Power supply |
| EN | 2 | I | High: on, enables the chip. Low: off, the chip powers off. Note: Do not leave the EN pin floating. |
| IO4 | 3 | I/O/T | GPIO4, ADC1_CH4, FSPIHD, MTMS |
| IO5 | 4 | I/O/T | GPIO5, ADC2_CH0, FSPIWP, MTDI |
| IO6 | 5 | I/O/T | GPIO6, FSPICLK, MTCK |
| IO7 | 6 | I/O/T | GPIO7, FSPID, MTDO |
| IO8 | 7 | I/O/T | GPIO8 |
| IO9 | 8 | I/O/T | GPIO9 |
| GND | 9,19 | P | Ground |
| IO10 | 10 | I/O/T | GPIO10, FSPICS0 |
| RXD | 11 | I/O/T | GPIO20, U0RXD |
| TXD | 12 | I/O/T | GPIO21, U0TXD |
| IO18 | 13 | I/O/T | GPIO18, USB_D- |
| IO19 | 14 | I/O/T | GPIO19, USB_D+ |
| IO3 | 15 | I/O/T | GPIO3, ADC1_CH3 |
| IO2 | 16 | I/O/T | GPIO2, ADC1_CH2, FSPIQ |
| IO1 | 17 | I/O/T | GPIO1, ADC1_CH1, XTAL_32K_N |
| IO0 | 18 | I/O/T | GPIO0, ADC1_CH0, XTAL_32K_P |

(note 1) P: power supply; I: input; O: output; T: high impedance.$t$),
 ('strapping-pins','Strapping pins and boot configuration','[12]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Strapping pins and boot configuration. Page: 12. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4 Boot Configurations**

The chip allows for configuring the following boot parameters through strapping pins and eFuse parameters at power-up or a hardware reset, without microcontroller interaction.

- Chip boot mode
  - Strapping pins: GPIO2, GPIO8, and GPIO9
- ROM message printing
  - Strapping pin: GPIO8
  - eFuse parameters: EFUSE_UART_PRINT_CONTROL and EFUSE_USB_PRINT_CHANNEL

The default values of all the above eFuse parameters are 0, which means that they are not burnt. Given that eFuse is one-time programmable, once programmed to 1, it can never be reverted to 0. For how to program eFuse parameters, please refer to ESP32-C3 Technical Reference Manual > Chapter eFuse Controller.

The default values of the strapping pins, namely the logic levels, are determined by pins' internal weak pull-up/pull-down resistors at reset if the pins are not connected to any circuit, or connected to an external high-impedance circuit.

**Table 4-1. Default Configuration of Strapping Pins**

| Strapping Pin | Default Configuration | Bit Value |
|---|---|---|
| GPIO2 | Floating | – |
| GPIO8 | Floating | – |
| GPIO9 | Weak pull-up | 1 |

To change the bit values, the strapping pins should be connected to external pull-down/pull-up resistances. If the ESP32-C3 is used as a device by a host MCU, the strapping pin voltage levels can also be controlled by the host MCU.

All strapping pins have latches. At Chip Reset, the latches sample the bit values of their respective strapping pins and store them until the chip is powered down or shut down. The states of latches cannot be changed in any other way. It makes the strapping pin values available during the entire chip operation, and the pins are freed up to be used as regular IO pins after reset. For details on Chip Reset, see ESP32-C3 Technical Reference Manual > Chapter Reset and Clock.$t$),
 ('boot-mode','Chip boot mode control','[13,14]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Chip boot mode control. Pages: 13, 14. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4.1 Chip Boot Mode Control**

GPIO2, GPIO8, and GPIO9 control the boot mode after the reset is released. See Table 4-3 Chip Boot Mode Control.

**Table 4-3. Chip Boot Mode Control**

| Boot Mode | GPIO2 (note 2) | GPIO8 | GPIO9 |
|---|---|---|---|
| **SPI boot mode** | 1 | Any value | **1** |
| Joint download boot mode (note 3) | 1 | 1 | 0 |

(note 1) Bold marks the default value and configuration.
(note 2) GPIO2 actually does not determine SPI Boot and Joint Download Boot mode, but it is recommended to pull this pin up due to glitches.
(note 3) Joint Download Boot mode supports the following download methods:
- USB-Serial-JTAG Download Boot
- UART Download Boot

In SPI Boot mode, the ROM bootloader loads and executes the program from SPI flash to boot the system.

In Joint Download Boot mode, users can download binary files into flash using UART0 or USB interface. It is also possible to download binary files into SRAM and execute it from SRAM.

In addition to SPI Boot and Joint Download Boot modes, ESP32-C3 also supports SPI Download Boot mode. For details, please see ESP32-C3 Technical Reference Manual > Chapter Chip Boot Control.$t$),
 ('module-variants','Module variants (Tables 1-1 and 1-2)','[3,4]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Module variants (Tables 1-1 and 1-2). Pages: 3, 4. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.2 Series Comparison**

ESP32-C3-WROOM-02 and ESP32-C3-WROOM-02U are two general-purpose Wi-Fi and Bluetooth LE modules. The rich set of peripherals and high performance make the two modules an ideal choice for smart homes, industrial automation, health care, consumer electronics, etc.

ESP32-C3-WROOM-02 and ESP32-C3-WROOM-02U both feature an external SPI flash.
ESP32-C3-WROOM-02 comes with a on-board PCB antenna. ESP32-C3-WROOM-02U comes with a connector for an external antenna.

A wide selection of module variants are available as shown in Table 1-1 and 1-2.

**Table 1-1. ESP32-C3-WROOM-02 (ANT) Series Comparison (note 1)**

| Part Number | Flash (note 4, 7) | Ambient Temp. (°C) (note 2) | Embedded Chip Revision | Size (mm) (note 3) |
|---|---|---|---|---|
| ESP32-C3-WROOM-02-N4 | 4 MB (Quad SPI) | −40 ~ 85 | v0.4 | 18.0 × 20.0 × 3.2 |
| ESP32-C3-WROOM-02-H4 | 4 MB (Quad SPI) | −40 ~ 105 | v0.4 | 18.0 × 20.0 × 3.2 |
| ESP32-C3-WROOM-02-N8 | 8 MB (Quad SPI) | −40 ~ 85 | v0.4 | 18.0 × 20.0 × 3.2 |

(note 1) This table shares the same notes presented in Table 1-2 below.

**Table 1-2. ESP32-C3-WROOM-02U (CONN) Series Comparison**

| Part Number | Flash (note 4, 7) | Ambient Temp. (°C) (note 2) | Embedded Chip Revision | Size (mm) (note 3) |
|---|---|---|---|---|
| ESP32-C3-WROOM-02U-N4 | 4 MB (Quad SPI) | −40 ~ 85 | v0.4 | 18.0 × 14.3 × 3.2 |
| ESP32-C3-WROOM-02U-H4 | 4 MB (Quad SPI) | −40 ~ 105 | v0.4 | 18.0 × 14.3 × 3.2 |
| ESP32-C3-WROOM-02U-N8 | 8 MB (Quad SPI) | −40 ~ 85 | v0.4 | 18.0 × 14.3 × 3.2 |$t$),
 ('variant-notes','Module variant notes (flash, temperature, chip revision)','[4]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Module variant notes (flash, temperature, chip revision). Page: 4. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Notes to Tables 1-1 and 1-2 (Module variant notes)**

(note 2) Ambient temperature specifies the recommended temperature range of the environment immediately outside the Espressif module.
(note 3) For details, refer to Section 10.1 Module Dimensions.
(note 4) All modules can be equipped with 16 MB flash. If needed, please contact our business team. For specifications, refer to Section 6.5 Memory Specifications.
(note 5) Customized version operating at −40 ~ 105 °C is available. For details, please contact our sales team.
(note 6) All chip revisions have the same SRAM size, but chip revision v1.1 has around 10 KB more available space for users than chip revision v0.4. Chip revision v1.1 depends on specific ESP-IDF versions, as detailed in Compatibility Advisory for ESP32-C3 Chip Revision v1.1. For how to identify chip revisions, please refer to ESP32-C3 Series SoC Errata.
(note 7) By default, the SPI flash on the module operates at a maximum clock frequency of 80 MHz and does not support the auto suspend feature. If you have a requirement for a higher flash clock frequency of 120 MHz or if you need the flash auto suspend feature, please contact us.

Both ESP32-C3-WROOM-02 and ESP32-C3-WROOM-02U has two operating ambient temperature options: −40 ~ 85 °C variants and −40 ~ 105 °C variants, all embedded with the ESP32-C3 chip.

Note: For more information on ESP32-C3, please refer to ESP32-C3 Series Datasheet. For chip revision identification, ESP-IDF release that supports a specific chip revision, and other information on chip revisions, please refer to ESP32-C3 Series SoC Errata > Section Chip Revision.$t$),
 ('electrical-ratings','Absolute maximum ratings and recommended operating conditions','[21]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Absolute maximum ratings and recommended operating conditions. Page: 21. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.1 Absolute Maximum Ratings**

Stresses above those listed in Table 6-1 Absolute Maximum Ratings may cause permanent damage to the device. These are stress ratings only and functional operation of the device at these or any other conditions beyond those indicated under Table 6-2 Recommended Operating Conditions is not implied. Exposure to absolute-maximum-rated conditions for extended periods may affect device reliability.

**Table 6-1. Absolute Maximum Ratings**

| Symbol | Parameter | Min | Max | Unit |
|---|---|---|---|---|
| VDD33 | Power supply voltage | −0.3 | 3.6 | V |

**6.2 Recommended Operating Conditions**

**Table 6-2. Recommended Operating Conditions**

| Symbol | Parameter | | Min | Typ | Max | Unit |
|---|---|---|---|---|---|---|
| VDD33 | Power supply voltage | | 3.0 | 3.3 | 3.6 | V |
| I_VDD | Current delivered by external power supply | | 0.5 | — | — | A |
| T_A | Operating ambient temperature | 85 °C version | −40 | — | 85 | °C |
| T_A | Operating ambient temperature | 105 °C version | −40 | — | 105 | °C |$t$),
 ('dc-characteristics','DC characteristics (3.3 V, 25 C)','[21,22]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: DC characteristics (3.3 V, 25 C). Pages: 21, 22. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 6-3. DC Characteristics (3.3 V, 25 °C)**

| Parameter | Description | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| C_IN | Pin capacitance | — | 2 | — | pF |
| V_IH | High-level input voltage | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| V_IL | Low-level input voltage | −0.3 | — | 0.25 × VDD (note 1) | V |
| I_IH | High-level input current | — | — | 50 | nA |
| I_IL | Low-level input current | — | — | 50 | nA |
| V_OH (note 2) | High-level output voltage | 0.8 × VDD (note 1) | — | — | V |
| V_OL (note 2) | Low-level output voltage | — | — | 0.1 × VDD (note 1) | V |
| I_OH | High-level source current (VDD (note 1) = 3.3 V, V_OH >= 2.64 V, PAD_DRIVER = 3) | — | 40 | — | mA |
| I_OL | Low-level sink current (VDD (note 1) = 3.3 V, V_OL = 0.495 V, PAD_DRIVER = 3) | — | 28 | — | mA |
| R_PU | Internal weak pull-up resistor | — | 45 | — | kΩ |
| R_PD | Internal weak pull-down resistor | — | 45 | — | kΩ |
| V_IH_nRST | Chip reset release voltage (CHIP_EN voltage is within the specified range) | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| V_IL_nRST | Chip reset voltage (CHIP_EN voltage is within the specified range) | −0.3 | — | 0.25 × VDD (note 1) | V |

(note 1) VDD – voltage from a power pin of a respective power domain.
(note 2) V_OH and V_OL are measured using high-impedance load.$t$),
 ('current-wifi-active','Current consumption, Wi-Fi active mode','[22]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Current consumption, Wi-Fi active mode. Page: 22. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4.1 Current Consumption in Active Mode**

The current consumption measurements are taken with a 3.3 V supply at 25 °C ambient temperature.

TX current consumption is rated at a 100% duty cycle.

RX current consumption is rated when the peripherals are disabled and the CPU idle.

**Table 6-4. Current Consumption for Wi-Fi (2.4 GHz) in Active Mode**

| Work mode | | Description | Peak (mA) |
|---|---|---|---|
| Active (RF working) | TX | 802.11b, 1 Mbps, @20.5 dBm | 345 |
| Active (RF working) | TX | 802.11g, 54 Mbps, @18 dBm | 285 |
| Active (RF working) | TX | 802.11n, HT20, MCS7, @17.5 dBm | 280 |
| Active (RF working) | TX | 802.11n, HT40, MCS7, @17 dBm | 280 |
| Active (RF working) | RX | 802.11b/g/n, HT20 | 82 |
| Active (RF working) | RX | 802.11n, HT40 | 84 |$t$),
 ('current-sleep-modes','Current consumption, modem-sleep and low-power modes','[22,23]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Current consumption, modem-sleep and low-power modes. Pages: 22, 23. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4.2 Current Consumption in Other Modes**

Note: The content below is excerpted from Section Power Consumption in Other Modes in ESP32-C3 Series Datasheet.

**Table 6-5. Current Consumption in Modem-sleep Mode**

| Mode | CPU Frequency (MHz) | Description | Typ, All Peripherals Clocks Disabled (mA) | Typ, All Peripherals Clocks Enabled (mA) (note 1) |
|---|---|---|---|---|
| Modem-sleep (note 2, 3) | 160 | CPU is running | 23 | 28 |
| Modem-sleep (note 2, 3) | 160 | CPU is idle | 16 | 21 |
| Modem-sleep (note 2, 3) | 80 | CPU is running | 17 | 22 |
| Modem-sleep (note 2, 3) | 80 | CPU is idle | 13 | 18 |

(note 1) In practice, the current consumption might be different depending on which peripherals are enabled.
(note 2) In Modem-sleep mode, Wi-Fi is clock gated.
(note 3) In Modem-sleep mode, the consumption might be higher when accessing flash. For a flash rated at 80 Mbit/s, in SPI 2-line mode the consumption is 10 mA.

**Table 6-6. Current Consumption in Low-Power Modes**

| Mode | Description | Typ (µA) |
|---|---|---|
| Light-sleep | VDD_SPI and Wi-Fi are powered down, and all GPIOs are high-impedance | 130 |
| Deep-sleep | RTC timer + RTC memory | 5 |
| Power off | CHIP_EN is set to low level, the chip is powered off | 1 |$t$),
 ('wifi-rf','Wi-Fi RF characteristics and TX power','[24]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Wi-Fi RF characteristics and TX power. Page: 24. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7 RF Characteristics**

This section contains tables with RF characteristics of the Espressif product.

The RF data is measured at the antenna port, where RF cable is connected, including the front-end loss. The external antennas used for the tests on the modules with external antenna connectors have an impedance of 50 Ω.
Devices should operate in the center frequency range allocated by regional regulatory authorities. The target center frequency range and the target transmit power are configurable by software. See ESP RF Test Tool and Test Guide for instructions.

Unless otherwise stated, the RF tests are conducted with a 3.3 V (±5%) supply at 25 °C ambient temperature.

**7.1 Wi-Fi Radio**

**Table 7-1. Wi-Fi RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2412 ~ 2484 MHz |
| Wi-Fi wireless standard | IEEE 802.11b/g/n |

**7.1.1 Wi-Fi RF Transmitter (TX) Characteristics**

**Table 7-2. TX Power with Spectral Mask and EVM Meeting 802.11 Standards**

| Rate | Min (dBm) | Typ (dBm) | Max (dBm) |
|---|---|---|---|
| 802.11b, 1 Mbps | — | 20.5 | — |
| 802.11b, 11 Mbps | — | 20.5 | — |
| 802.11g, 6 Mbps | — | 20.0 | — |
| 802.11g, 54 Mbps | — | 18.0 | — |
| 802.11n, HT20, MCS0 | — | 19.0 | — |
| 802.11n, HT20, MCS7 | — | 17.5 | — |
| 802.11n, HT40, MCS0 | — | 18.5 | — |
| 802.11n, HT40, MCS7 | — | 17.0 | — |$t$),
 ('ble-rf','Bluetooth LE RF characteristics','[26]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Bluetooth LE RF characteristics. Page: 26. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7.2 Bluetooth 5 (LE) Radio**

**Table 7-7. Bluetooth LE RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2402 ~ 2480 MHz |
| RF transmit power range | −24.0 ~ 20.0 dBm |$t$),
 ('peripherals-uart-spi','Peripherals: UART and SPI','[16,17]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Peripherals: UART and SPI. Pages: 16, 17. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**5.2.1.1 UART Controller**

ESP32-C3 has two UART interfaces, i.e. UART0 and UART1, which support IrDA and asynchronous communication (RS232 and RS485) at a speed of up to 5 Mbps. The UART controller provides hardware flow control (CTS and RTS signals) and software flow control (XON and XOFF). Both UART interfaces connect to GDMA via UHCI0, and can be accessed by the GDMA controller or directly by the CPU.

For details, see ESP32-C3 Technical Reference Manual > Chapter UART Controller (UART).

Pin Assignment: For details, see ESP32-C3 Series Datasheet > Section Peripheral Pin Assignment.

**5.2.1.2 SPI Controller**

ESP32-C3 has the following SPI interfaces:
- SPI0 used by ESP32-C3's GDMA controller and cache to access in-package or off-package flash
- SPI1 used by the CPU to access in-package or off-package flash
- SPI2 is a general purpose SPI controller with access to a DMA channel allocated by the GDMA controller

Features of SPI0 and SPI1
- Supports Single SPI, Dual SPI, and Quad SPI, QPI modes
- Configurable clock frequency with a maximum of 120 MHz in Single Transfer Rate (STR) mode
- Data transmission is in bytes

Features of SPI2
- Supports operation as a master or slave
- Connects to a DMA channel allocated by the GDMA controller
- Supports Single SPI, Dual SPI, and Quad SPI, QPI
- Configurable clock polarity (CPOL) and phase (CPHA)
- Configurable clock frequency
- Data transmission is in bytes
- Configurable read and write data bit order: most-significant bit (MSB) first, or least-significant bit (LSB) first
- As a master
  - Supports 2-line full-duplex communication with clock frequency up to 80 MHz
  - Supports 1-, 2-, 4-line half-duplex communication with clock frequency up to 80 MHz
  - Provides six SPI_CS pins for connection with six independent SPI slaves
  - Configurable CS setup time and hold time
- As a slave
  - Supports 2-line full-duplex communication with clock frequency up to 60 MHz
  - Supports 1-, 2-, 4-line half-duplex communication with clock frequency up to 60 MHz

For details, see ESP32-C3 Technical Reference Manual > Chapter SPI Controller (SPI).$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xC3 ESP32-C3 Development Board','Espressif ESP32-C3-WROOM-02 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxc3-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='1632b696-9004-4f85-8aac-24be058c5cc1' AND artifact_key='433ac5952e4a91f29c42398160e353d0e062fa01ba00852993849a04187348f1';
 FOR r IN SELECT * FROM (VALUES
 ('peripherals-i2c-i2s-usb','Peripherals: I2C, I2S and USB Serial/JTAG','[17,18]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Peripherals: I2C, I2S and USB Serial/JTAG. Pages: 17, 18. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**5.2.1.3 I2C Controller**

ESP32-C3 has an I2C bus interface which is used for I2C master mode or slave mode, depending on your configuration. The I2C interface supports:
- Standard mode (100 Kbit/s)
- Fast mode (400 Kbit/s)
- Up to 800 Kbit/s (constrained by SCL and SDA pull-up strength)
- 7-bit and 10-bit addressing mode
- Double addressing mode
- 7-bit broadcast address

For details, see ESP32-C3 Technical Reference Manual > Chapter I2C Controller (I2C).

Pin Assignment: For details, see ESP32-C3 Series Datasheet > Section Peripheral Pin Assignment.

**5.2.1.4 I2S Controller**

ESP32-C3 includes a standard I2S interface. This interface can operate as a master or a slave in full-duplex mode or half-duplex mode, and can be configured for 8-bit, 16-bit, 24-bit, or 32-bit serial communication. BCK clock frequency, from 10 kHz up to 40 MHz, is supported.

The I2S interface connects to the GDMA controller. The interface supports TDM PCM, TDM MSB alignment, TDM standard, and PDM standard.

For details, see ESP32-C3 Technical Reference Manual > Chapter I2S Controller (I2S).

Pin Assignment: For details, see ESP32-C3 Series Datasheet > Section Peripheral Pin Assignment.

**5.2.1.5 USB Serial/JTAG Controller**

ESP32-C3 integrates a USB Serial/JTAG controller. This controller has the following features:
- CDC-ACM virtual serial port and JTAG adapter functionality
- USB 2.0 full speed compliant, capable of up to 12 Mbit/s transfer speed (Note that this controller does not support the faster 480 Mbit/s high-speed transfer mode)
- Programming in-package/off-package flash
- CPU debugging with compact JTAG instructions
- A full-speed USB PHY integrated in the chip

For details, see ESP32-C3 Technical Reference Manual > Chapter USB Serial/JTAG Controller (USB_SERIAL_JTAG).

Pin Assignment: For details, see ESP32-C3 Series Datasheet > Section Peripheral Pin Assignment.$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xC3 ESP32-C3 Development Board','Espressif ESP32-C3-WROOM-02 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxc3-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE v public.panda_agent_versions; n bigint; d text;
BEGIN
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE source_id='1632b696-9004-4f85-8aac-24be058c5cc1' AND artifact_key='433ac5952e4a91f29c42398160e353d0e062fa01ba00852993849a04187348f1';
 IF v.state='approved' THEN RETURN; END IF;
 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(logical_chunk_id||':'||text_hash||':'||locator,E'\n' ORDER BY logical_chunk_id),''),'UTF8')),'hex') INTO n,d FROM public.panda_agent_chunks WHERE document_version_id=v.id;
 IF n<>14 THEN RAISE EXCEPTION 'ESPXC3: % chunks, expected 14',n; END IF;
 PERFORM public.panda_agent_seal_version(v.id,v.version,n::int,d);
 PERFORM public.panda_agent_review_version(v.id,v.version+1,'approve','Owner requested Espressif datasheet excerpts on 2026-11-13; tables number-checked against the PDF text layer');
END $m$;
-- @@split
DO $m$ BEGIN
 PERFORM public.panda_agent_store_version('a6c2f225-bc0f-4e45-a6a2-6b635ae39b31','69173645-933f-4b98-a682-cda936dc6f20','087d03ec-8d40-4095-9335-610f696a2ff2',NULL,'8cb40338dfd22bc9f017dc4cee0fc59cae7cbd6ab7518007f4783cd2a9269ed6','622db737a711a75e89185aed850f3854c77d515c32ddf0ba9886653663cfdabe',952496,$t${"document":"ESP32-C3-WROOM-02 Datasheet","version":"v1.7, 2026-03-05","source_url":"https://documentation.espressif.com/esp32-c3-wroom-02_datasheet_en.pdf","pdf_sha256":"622db737a711a75e89185aed850f3854c77d515c32ddf0ba9886653663cfdabe","excerpts":[{"key":"overview-features","sha256":"4cdb1e4e3703b37bd50b61513b4419cdb17e49c79c3cfaf42d97beba0b683505"},{"key":"pin-definitions","sha256":"529c64e5bd300fa958f169957b1ccc7e42140e17f2dbf838d7afebde9f9d9d14"},{"key":"strapping-pins","sha256":"872397ec4bc69360421beefaa47a811f9eac282c6fc80665fcf1756dce94c339"},{"key":"boot-mode","sha256":"5989defd8070cb6ced53eb75694ce8b2aa5953093d4369a9615b7c4328524902"},{"key":"module-variants","sha256":"7903f86b0ab223cb9e9e03decc533a55e465a83ab2720fa4bd229c22b54faea1"},{"key":"variant-notes","sha256":"2e91c379f5fafb4a73f6c70b90f140579832e4c5134c49fe1bced4bd9f444196"},{"key":"electrical-ratings","sha256":"35ab3954f99712735a2460dda1528b0149f90af30546225e95751b61a50fffb6"},{"key":"dc-characteristics","sha256":"d50ded2c09a124354db9dbcc4dfedd3a0635f114c87173c9ba2d46953c87a525"},{"key":"current-wifi-active","sha256":"79f6e48cdad14be6b00efd9eaea3e24c9df9f838b6c7bb0e5848c45c02178e91"},{"key":"current-sleep-modes","sha256":"7779ef481d55096dc70ee70547161338fac0fb565d02dcf5b6f3d54a96ef5726"},{"key":"wifi-rf","sha256":"a4f280b80841fef778a70c311f1c2b482daf906adc1555b4a068a9f1e29eaae4"},{"key":"ble-rf","sha256":"cfa39c01c2583c99b0c448bf3a86abef98c56af343ac97830194327373f8b78d"},{"key":"peripherals-uart-spi","sha256":"a29cd7dacf7559efc1bb1afce1b56a137cec38f95ee61377801c836602b0b0be"},{"key":"peripherals-i2c-i2s-usb","sha256":"3c852c53e1df2863fe839bb35a7815b18d943984af30c4574d7c42a001b8f497"}]}$t$,'68386d5d95d6890f8ddac6f45dd282c0db34e37dcfa71f57ebba57f41bc141df','espressif-datasheet-excerpts-v1','386403f66ddfed7a20e2d02758e9bff83e6fd757cb34a89c208a52f03212b384','technical',NULL,'{"captured_at":"2026-11-13T00:00:00+00:00","rights":"vendor_datasheet_short_cited_excerpts_only","copyright_holder":"Espressif Systems","original_url":"https://documentation.espressif.com/esp32-c3-wroom-02_datasheet_en.pdf","document":"ESP32-C3-WROOM-02 Datasheet","document_version":"v1.7, 2026-03-05","method":"excerpts selected from the PDF text layer; tables transcribed from rendered pages and number-checked; owner requested 2026-11-13"}'::jsonb);
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='a6c2f225-bc0f-4e45-a6a2-6b635ae39b31' AND artifact_key='8cb40338dfd22bc9f017dc4cee0fc59cae7cbd6ab7518007f4783cd2a9269ed6';
 FOR r IN SELECT * FROM (VALUES
 ('overview-features','Module overview and features','[2]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Module overview and features. Page: 2. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features**

**CPU and On-Chip Memory**
- ESP32-C3 embedded, 32-bit RISC-V single-core processor, up to 160 MHz
- 384 KB ROM
- 400 KB SRAM (16 KB for cache)
- 8 KB SRAM in RTC

**Wi-Fi**
- IEEE 802.11b/g/n-compliant
- Center frequency range of operating channel: 2412 ~ 2484 MHz
- Supports 20 MHz, 40 MHz bandwidth in 2.4 GHz band
- 1T1R mode with data rate up to 150 Mbps
- Wi-Fi Multimedia (WMM)
- TX/RX A-MPDU, TX/RX A-MSDU
- Immediate Block ACK
- Fragmentation and defragmentation
- Transmit opportunity (TXOP)
- Automatic Beacon monitoring (hardware TSF)
- 4 × virtual Wi-Fi interfaces

**Bluetooth®**
- Bluetooth LE: Bluetooth 5, Bluetooth mesh
- Speed: 125 Kbps, 500 Kbps, 1 Mbps, 2 Mbps
- Advertising extensions
- Multiple advertisement sets
- Channel selection algorithm #2
- Internal co-existence mechanism between Wi-Fi and Bluetooth to share the same antenna

**Peripherals**
- Up to 15 GPIOs
  - 3 strapping GPIOs
- SPI, UART, I2C, I2S, remote control peripheral, LED PWM controller, general DMA controller, TWAI® controller (compatible with ISO 11898-1, i.e. CAN Specification 2.0), USB Serial/JTAG controller, temperature sensor, SAR ADC, general-purpose timers, watchdog timers

Note: * Please refer to ESP32-C3 Series Datasheet for detailed information about the module peripherals.$t$),
 ('pin-definitions','Pin definitions','[10,11]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Pin definitions. Pages: 10, 11. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3-1. Pin Definitions**

| Name | No. | Type (note 1) | Function |
|---|---|---|---|
| 3V3 | 1 | P | Power supply |
| EN | 2 | I | High: on, enables the chip. Low: off, the chip powers off. Note: Do not leave the EN pin floating. |
| IO4 | 3 | I/O/T | GPIO4, ADC1_CH4, FSPIHD, MTMS |
| IO5 | 4 | I/O/T | GPIO5, ADC2_CH0, FSPIWP, MTDI |
| IO6 | 5 | I/O/T | GPIO6, FSPICLK, MTCK |
| IO7 | 6 | I/O/T | GPIO7, FSPID, MTDO |
| IO8 | 7 | I/O/T | GPIO8 |
| IO9 | 8 | I/O/T | GPIO9 |
| GND | 9,19 | P | Ground |
| IO10 | 10 | I/O/T | GPIO10, FSPICS0 |
| RXD | 11 | I/O/T | GPIO20, U0RXD |
| TXD | 12 | I/O/T | GPIO21, U0TXD |
| IO18 | 13 | I/O/T | GPIO18, USB_D- |
| IO19 | 14 | I/O/T | GPIO19, USB_D+ |
| IO3 | 15 | I/O/T | GPIO3, ADC1_CH3 |
| IO2 | 16 | I/O/T | GPIO2, ADC1_CH2, FSPIQ |
| IO1 | 17 | I/O/T | GPIO1, ADC1_CH1, XTAL_32K_N |
| IO0 | 18 | I/O/T | GPIO0, ADC1_CH0, XTAL_32K_P |

(note 1) P: power supply; I: input; O: output; T: high impedance.$t$),
 ('strapping-pins','Strapping pins and boot configuration','[12]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Strapping pins and boot configuration. Page: 12. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4 Boot Configurations**

The chip allows for configuring the following boot parameters through strapping pins and eFuse parameters at power-up or a hardware reset, without microcontroller interaction.

- Chip boot mode
  - Strapping pins: GPIO2, GPIO8, and GPIO9
- ROM message printing
  - Strapping pin: GPIO8
  - eFuse parameters: EFUSE_UART_PRINT_CONTROL and EFUSE_USB_PRINT_CHANNEL

The default values of all the above eFuse parameters are 0, which means that they are not burnt. Given that eFuse is one-time programmable, once programmed to 1, it can never be reverted to 0. For how to program eFuse parameters, please refer to ESP32-C3 Technical Reference Manual > Chapter eFuse Controller.

The default values of the strapping pins, namely the logic levels, are determined by pins' internal weak pull-up/pull-down resistors at reset if the pins are not connected to any circuit, or connected to an external high-impedance circuit.

**Table 4-1. Default Configuration of Strapping Pins**

| Strapping Pin | Default Configuration | Bit Value |
|---|---|---|
| GPIO2 | Floating | – |
| GPIO8 | Floating | – |
| GPIO9 | Weak pull-up | 1 |

To change the bit values, the strapping pins should be connected to external pull-down/pull-up resistances. If the ESP32-C3 is used as a device by a host MCU, the strapping pin voltage levels can also be controlled by the host MCU.

All strapping pins have latches. At Chip Reset, the latches sample the bit values of their respective strapping pins and store them until the chip is powered down or shut down. The states of latches cannot be changed in any other way. It makes the strapping pin values available during the entire chip operation, and the pins are freed up to be used as regular IO pins after reset. For details on Chip Reset, see ESP32-C3 Technical Reference Manual > Chapter Reset and Clock.$t$),
 ('boot-mode','Chip boot mode control','[13,14]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Chip boot mode control. Pages: 13, 14. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4.1 Chip Boot Mode Control**

GPIO2, GPIO8, and GPIO9 control the boot mode after the reset is released. See Table 4-3 Chip Boot Mode Control.

**Table 4-3. Chip Boot Mode Control**

| Boot Mode | GPIO2 (note 2) | GPIO8 | GPIO9 |
|---|---|---|---|
| **SPI boot mode** | 1 | Any value | **1** |
| Joint download boot mode (note 3) | 1 | 1 | 0 |

(note 1) Bold marks the default value and configuration.
(note 2) GPIO2 actually does not determine SPI Boot and Joint Download Boot mode, but it is recommended to pull this pin up due to glitches.
(note 3) Joint Download Boot mode supports the following download methods:
- USB-Serial-JTAG Download Boot
- UART Download Boot

In SPI Boot mode, the ROM bootloader loads and executes the program from SPI flash to boot the system.

In Joint Download Boot mode, users can download binary files into flash using UART0 or USB interface. It is also possible to download binary files into SRAM and execute it from SRAM.

In addition to SPI Boot and Joint Download Boot modes, ESP32-C3 also supports SPI Download Boot mode. For details, please see ESP32-C3 Technical Reference Manual > Chapter Chip Boot Control.$t$),
 ('module-variants','Module variants (Tables 1-1 and 1-2)','[3,4]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Module variants (Tables 1-1 and 1-2). Pages: 3, 4. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.2 Series Comparison**

ESP32-C3-WROOM-02 and ESP32-C3-WROOM-02U are two general-purpose Wi-Fi and Bluetooth LE modules. The rich set of peripherals and high performance make the two modules an ideal choice for smart homes, industrial automation, health care, consumer electronics, etc.

ESP32-C3-WROOM-02 and ESP32-C3-WROOM-02U both feature an external SPI flash.
ESP32-C3-WROOM-02 comes with a on-board PCB antenna. ESP32-C3-WROOM-02U comes with a connector for an external antenna.

A wide selection of module variants are available as shown in Table 1-1 and 1-2.

**Table 1-1. ESP32-C3-WROOM-02 (ANT) Series Comparison (note 1)**

| Part Number | Flash (note 4, 7) | Ambient Temp. (°C) (note 2) | Embedded Chip Revision | Size (mm) (note 3) |
|---|---|---|---|---|
| ESP32-C3-WROOM-02-N4 | 4 MB (Quad SPI) | −40 ~ 85 | v0.4 | 18.0 × 20.0 × 3.2 |
| ESP32-C3-WROOM-02-H4 | 4 MB (Quad SPI) | −40 ~ 105 | v0.4 | 18.0 × 20.0 × 3.2 |
| ESP32-C3-WROOM-02-N8 | 8 MB (Quad SPI) | −40 ~ 85 | v0.4 | 18.0 × 20.0 × 3.2 |

(note 1) This table shares the same notes presented in Table 1-2 below.

**Table 1-2. ESP32-C3-WROOM-02U (CONN) Series Comparison**

| Part Number | Flash (note 4, 7) | Ambient Temp. (°C) (note 2) | Embedded Chip Revision | Size (mm) (note 3) |
|---|---|---|---|---|
| ESP32-C3-WROOM-02U-N4 | 4 MB (Quad SPI) | −40 ~ 85 | v0.4 | 18.0 × 14.3 × 3.2 |
| ESP32-C3-WROOM-02U-H4 | 4 MB (Quad SPI) | −40 ~ 105 | v0.4 | 18.0 × 14.3 × 3.2 |
| ESP32-C3-WROOM-02U-N8 | 8 MB (Quad SPI) | −40 ~ 85 | v0.4 | 18.0 × 14.3 × 3.2 |$t$),
 ('variant-notes','Module variant notes (flash, temperature, chip revision)','[4]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Module variant notes (flash, temperature, chip revision). Page: 4. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Notes to Tables 1-1 and 1-2 (Module variant notes)**

(note 2) Ambient temperature specifies the recommended temperature range of the environment immediately outside the Espressif module.
(note 3) For details, refer to Section 10.1 Module Dimensions.
(note 4) All modules can be equipped with 16 MB flash. If needed, please contact our business team. For specifications, refer to Section 6.5 Memory Specifications.
(note 5) Customized version operating at −40 ~ 105 °C is available. For details, please contact our sales team.
(note 6) All chip revisions have the same SRAM size, but chip revision v1.1 has around 10 KB more available space for users than chip revision v0.4. Chip revision v1.1 depends on specific ESP-IDF versions, as detailed in Compatibility Advisory for ESP32-C3 Chip Revision v1.1. For how to identify chip revisions, please refer to ESP32-C3 Series SoC Errata.
(note 7) By default, the SPI flash on the module operates at a maximum clock frequency of 80 MHz and does not support the auto suspend feature. If you have a requirement for a higher flash clock frequency of 120 MHz or if you need the flash auto suspend feature, please contact us.

Both ESP32-C3-WROOM-02 and ESP32-C3-WROOM-02U has two operating ambient temperature options: −40 ~ 85 °C variants and −40 ~ 105 °C variants, all embedded with the ESP32-C3 chip.

Note: For more information on ESP32-C3, please refer to ESP32-C3 Series Datasheet. For chip revision identification, ESP-IDF release that supports a specific chip revision, and other information on chip revisions, please refer to ESP32-C3 Series SoC Errata > Section Chip Revision.$t$),
 ('electrical-ratings','Absolute maximum ratings and recommended operating conditions','[21]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Absolute maximum ratings and recommended operating conditions. Page: 21. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.1 Absolute Maximum Ratings**

Stresses above those listed in Table 6-1 Absolute Maximum Ratings may cause permanent damage to the device. These are stress ratings only and functional operation of the device at these or any other conditions beyond those indicated under Table 6-2 Recommended Operating Conditions is not implied. Exposure to absolute-maximum-rated conditions for extended periods may affect device reliability.

**Table 6-1. Absolute Maximum Ratings**

| Symbol | Parameter | Min | Max | Unit |
|---|---|---|---|---|
| VDD33 | Power supply voltage | −0.3 | 3.6 | V |

**6.2 Recommended Operating Conditions**

**Table 6-2. Recommended Operating Conditions**

| Symbol | Parameter | | Min | Typ | Max | Unit |
|---|---|---|---|---|---|---|
| VDD33 | Power supply voltage | | 3.0 | 3.3 | 3.6 | V |
| I_VDD | Current delivered by external power supply | | 0.5 | — | — | A |
| T_A | Operating ambient temperature | 85 °C version | −40 | — | 85 | °C |
| T_A | Operating ambient temperature | 105 °C version | −40 | — | 105 | °C |$t$),
 ('dc-characteristics','DC characteristics (3.3 V, 25 C)','[21,22]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: DC characteristics (3.3 V, 25 C). Pages: 21, 22. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 6-3. DC Characteristics (3.3 V, 25 °C)**

| Parameter | Description | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| C_IN | Pin capacitance | — | 2 | — | pF |
| V_IH | High-level input voltage | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| V_IL | Low-level input voltage | −0.3 | — | 0.25 × VDD (note 1) | V |
| I_IH | High-level input current | — | — | 50 | nA |
| I_IL | Low-level input current | — | — | 50 | nA |
| V_OH (note 2) | High-level output voltage | 0.8 × VDD (note 1) | — | — | V |
| V_OL (note 2) | Low-level output voltage | — | — | 0.1 × VDD (note 1) | V |
| I_OH | High-level source current (VDD (note 1) = 3.3 V, V_OH >= 2.64 V, PAD_DRIVER = 3) | — | 40 | — | mA |
| I_OL | Low-level sink current (VDD (note 1) = 3.3 V, V_OL = 0.495 V, PAD_DRIVER = 3) | — | 28 | — | mA |
| R_PU | Internal weak pull-up resistor | — | 45 | — | kΩ |
| R_PD | Internal weak pull-down resistor | — | 45 | — | kΩ |
| V_IH_nRST | Chip reset release voltage (CHIP_EN voltage is within the specified range) | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| V_IL_nRST | Chip reset voltage (CHIP_EN voltage is within the specified range) | −0.3 | — | 0.25 × VDD (note 1) | V |

(note 1) VDD – voltage from a power pin of a respective power domain.
(note 2) V_OH and V_OL are measured using high-impedance load.$t$),
 ('current-wifi-active','Current consumption, Wi-Fi active mode','[22]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Current consumption, Wi-Fi active mode. Page: 22. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4.1 Current Consumption in Active Mode**

The current consumption measurements are taken with a 3.3 V supply at 25 °C ambient temperature.

TX current consumption is rated at a 100% duty cycle.

RX current consumption is rated when the peripherals are disabled and the CPU idle.

**Table 6-4. Current Consumption for Wi-Fi (2.4 GHz) in Active Mode**

| Work mode | | Description | Peak (mA) |
|---|---|---|---|
| Active (RF working) | TX | 802.11b, 1 Mbps, @20.5 dBm | 345 |
| Active (RF working) | TX | 802.11g, 54 Mbps, @18 dBm | 285 |
| Active (RF working) | TX | 802.11n, HT20, MCS7, @17.5 dBm | 280 |
| Active (RF working) | TX | 802.11n, HT40, MCS7, @17 dBm | 280 |
| Active (RF working) | RX | 802.11b/g/n, HT20 | 82 |
| Active (RF working) | RX | 802.11n, HT40 | 84 |$t$),
 ('current-sleep-modes','Current consumption, modem-sleep and low-power modes','[22,23]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Current consumption, modem-sleep and low-power modes. Pages: 22, 23. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4.2 Current Consumption in Other Modes**

Note: The content below is excerpted from Section Power Consumption in Other Modes in ESP32-C3 Series Datasheet.

**Table 6-5. Current Consumption in Modem-sleep Mode**

| Mode | CPU Frequency (MHz) | Description | Typ, All Peripherals Clocks Disabled (mA) | Typ, All Peripherals Clocks Enabled (mA) (note 1) |
|---|---|---|---|---|
| Modem-sleep (note 2, 3) | 160 | CPU is running | 23 | 28 |
| Modem-sleep (note 2, 3) | 160 | CPU is idle | 16 | 21 |
| Modem-sleep (note 2, 3) | 80 | CPU is running | 17 | 22 |
| Modem-sleep (note 2, 3) | 80 | CPU is idle | 13 | 18 |

(note 1) In practice, the current consumption might be different depending on which peripherals are enabled.
(note 2) In Modem-sleep mode, Wi-Fi is clock gated.
(note 3) In Modem-sleep mode, the consumption might be higher when accessing flash. For a flash rated at 80 Mbit/s, in SPI 2-line mode the consumption is 10 mA.

**Table 6-6. Current Consumption in Low-Power Modes**

| Mode | Description | Typ (µA) |
|---|---|---|
| Light-sleep | VDD_SPI and Wi-Fi are powered down, and all GPIOs are high-impedance | 130 |
| Deep-sleep | RTC timer + RTC memory | 5 |
| Power off | CHIP_EN is set to low level, the chip is powered off | 1 |$t$),
 ('wifi-rf','Wi-Fi RF characteristics and TX power','[24]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Wi-Fi RF characteristics and TX power. Page: 24. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7 RF Characteristics**

This section contains tables with RF characteristics of the Espressif product.

The RF data is measured at the antenna port, where RF cable is connected, including the front-end loss. The external antennas used for the tests on the modules with external antenna connectors have an impedance of 50 Ω.
Devices should operate in the center frequency range allocated by regional regulatory authorities. The target center frequency range and the target transmit power are configurable by software. See ESP RF Test Tool and Test Guide for instructions.

Unless otherwise stated, the RF tests are conducted with a 3.3 V (±5%) supply at 25 °C ambient temperature.

**7.1 Wi-Fi Radio**

**Table 7-1. Wi-Fi RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2412 ~ 2484 MHz |
| Wi-Fi wireless standard | IEEE 802.11b/g/n |

**7.1.1 Wi-Fi RF Transmitter (TX) Characteristics**

**Table 7-2. TX Power with Spectral Mask and EVM Meeting 802.11 Standards**

| Rate | Min (dBm) | Typ (dBm) | Max (dBm) |
|---|---|---|---|
| 802.11b, 1 Mbps | — | 20.5 | — |
| 802.11b, 11 Mbps | — | 20.5 | — |
| 802.11g, 6 Mbps | — | 20.0 | — |
| 802.11g, 54 Mbps | — | 18.0 | — |
| 802.11n, HT20, MCS0 | — | 19.0 | — |
| 802.11n, HT20, MCS7 | — | 17.5 | — |
| 802.11n, HT40, MCS0 | — | 18.5 | — |
| 802.11n, HT40, MCS7 | — | 17.0 | — |$t$),
 ('ble-rf','Bluetooth LE RF characteristics','[26]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Bluetooth LE RF characteristics. Page: 26. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7.2 Bluetooth 5 (LE) Radio**

**Table 7-7. Bluetooth LE RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2402 ~ 2480 MHz |
| RF transmit power range | −24.0 ~ 20.0 dBm |$t$),
 ('peripherals-uart-spi','Peripherals: UART and SPI','[16,17]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Peripherals: UART and SPI. Pages: 16, 17. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**5.2.1.1 UART Controller**

ESP32-C3 has two UART interfaces, i.e. UART0 and UART1, which support IrDA and asynchronous communication (RS232 and RS485) at a speed of up to 5 Mbps. The UART controller provides hardware flow control (CTS and RTS signals) and software flow control (XON and XOFF). Both UART interfaces connect to GDMA via UHCI0, and can be accessed by the GDMA controller or directly by the CPU.

For details, see ESP32-C3 Technical Reference Manual > Chapter UART Controller (UART).

Pin Assignment: For details, see ESP32-C3 Series Datasheet > Section Peripheral Pin Assignment.

**5.2.1.2 SPI Controller**

ESP32-C3 has the following SPI interfaces:
- SPI0 used by ESP32-C3's GDMA controller and cache to access in-package or off-package flash
- SPI1 used by the CPU to access in-package or off-package flash
- SPI2 is a general purpose SPI controller with access to a DMA channel allocated by the GDMA controller

Features of SPI0 and SPI1
- Supports Single SPI, Dual SPI, and Quad SPI, QPI modes
- Configurable clock frequency with a maximum of 120 MHz in Single Transfer Rate (STR) mode
- Data transmission is in bytes

Features of SPI2
- Supports operation as a master or slave
- Connects to a DMA channel allocated by the GDMA controller
- Supports Single SPI, Dual SPI, and Quad SPI, QPI
- Configurable clock polarity (CPOL) and phase (CPHA)
- Configurable clock frequency
- Data transmission is in bytes
- Configurable read and write data bit order: most-significant bit (MSB) first, or least-significant bit (LSB) first
- As a master
  - Supports 2-line full-duplex communication with clock frequency up to 80 MHz
  - Supports 1-, 2-, 4-line half-duplex communication with clock frequency up to 80 MHz
  - Provides six SPI_CS pins for connection with six independent SPI slaves
  - Configurable CS setup time and hold time
- As a slave
  - Supports 2-line full-duplex communication with clock frequency up to 60 MHz
  - Supports 1-, 2-, 4-line half-duplex communication with clock frequency up to 60 MHz

For details, see ESP32-C3 Technical Reference Manual > Chapter SPI Controller (SPI).$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xC3m ESP32-C3 Development Board','Espressif ESP32-C3-WROOM-02 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxc3m-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='a6c2f225-bc0f-4e45-a6a2-6b635ae39b31' AND artifact_key='8cb40338dfd22bc9f017dc4cee0fc59cae7cbd6ab7518007f4783cd2a9269ed6';
 FOR r IN SELECT * FROM (VALUES
 ('peripherals-i2c-i2s-usb','Peripherals: I2C, I2S and USB Serial/JTAG','[17,18]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C3-WROOM-02 Datasheet, v1.7, 2026-03-05. Section: Peripherals: I2C, I2S and USB Serial/JTAG. Pages: 17, 18. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**5.2.1.3 I2C Controller**

ESP32-C3 has an I2C bus interface which is used for I2C master mode or slave mode, depending on your configuration. The I2C interface supports:
- Standard mode (100 Kbit/s)
- Fast mode (400 Kbit/s)
- Up to 800 Kbit/s (constrained by SCL and SDA pull-up strength)
- 7-bit and 10-bit addressing mode
- Double addressing mode
- 7-bit broadcast address

For details, see ESP32-C3 Technical Reference Manual > Chapter I2C Controller (I2C).

Pin Assignment: For details, see ESP32-C3 Series Datasheet > Section Peripheral Pin Assignment.

**5.2.1.4 I2S Controller**

ESP32-C3 includes a standard I2S interface. This interface can operate as a master or a slave in full-duplex mode or half-duplex mode, and can be configured for 8-bit, 16-bit, 24-bit, or 32-bit serial communication. BCK clock frequency, from 10 kHz up to 40 MHz, is supported.

The I2S interface connects to the GDMA controller. The interface supports TDM PCM, TDM MSB alignment, TDM standard, and PDM standard.

For details, see ESP32-C3 Technical Reference Manual > Chapter I2S Controller (I2S).

Pin Assignment: For details, see ESP32-C3 Series Datasheet > Section Peripheral Pin Assignment.

**5.2.1.5 USB Serial/JTAG Controller**

ESP32-C3 integrates a USB Serial/JTAG controller. This controller has the following features:
- CDC-ACM virtual serial port and JTAG adapter functionality
- USB 2.0 full speed compliant, capable of up to 12 Mbit/s transfer speed (Note that this controller does not support the faster 480 Mbit/s high-speed transfer mode)
- Programming in-package/off-package flash
- CPU debugging with compact JTAG instructions
- A full-speed USB PHY integrated in the chip

For details, see ESP32-C3 Technical Reference Manual > Chapter USB Serial/JTAG Controller (USB_SERIAL_JTAG).

Pin Assignment: For details, see ESP32-C3 Series Datasheet > Section Peripheral Pin Assignment.$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xC3m ESP32-C3 Development Board','Espressif ESP32-C3-WROOM-02 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxc3m-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE v public.panda_agent_versions; n bigint; d text;
BEGIN
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE source_id='a6c2f225-bc0f-4e45-a6a2-6b635ae39b31' AND artifact_key='8cb40338dfd22bc9f017dc4cee0fc59cae7cbd6ab7518007f4783cd2a9269ed6';
 IF v.state='approved' THEN RETURN; END IF;
 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(logical_chunk_id||':'||text_hash||':'||locator,E'\n' ORDER BY logical_chunk_id),''),'UTF8')),'hex') INTO n,d FROM public.panda_agent_chunks WHERE document_version_id=v.id;
 IF n<>14 THEN RAISE EXCEPTION 'ESPXC3M: % chunks, expected 14',n; END IF;
 PERFORM public.panda_agent_seal_version(v.id,v.version,n::int,d);
 PERFORM public.panda_agent_review_version(v.id,v.version+1,'approve','Owner requested Espressif datasheet excerpts on 2026-11-13; tables number-checked against the PDF text layer');
END $m$;
-- @@split
DO $m$ BEGIN
 PERFORM public.panda_agent_store_version('c24ef793-79b6-4918-8937-2ad78f690591','618f3ca7-76bc-4435-bac6-e237ec06023a','f13f8dff-dde9-4b22-9fa1-b26700ac3f46',NULL,'7b9c46e3e91c58ab5ea70ed3c369d49864319e38ebccdaf4962e839dd94f0491','4c7a345d1c1bfec34c38665639e39a7f43b79a35a12f6adcc2c7c0f83850f8b8',1230114,$t${"document":"ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet","version":"v2.1, 2026-08-05","source_url":"https://documentation.espressif.com/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf","pdf_sha256":"4c7a345d1c1bfec34c38665639e39a7f43b79a35a12f6adcc2c7c0f83850f8b8","excerpts":[{"key":"features","sha256":"24dbb22cc3ca241ad5f73bf02ec5799137d97ceffd2c70afbc9acd312f75a923"},{"key":"series-comparison-wroom-32e","sha256":"27a477111f66c2f372d3e8740cb1b4936b7fb38321a3837e69816c8798c19979"},{"key":"series-comparison-wroom-32ue","sha256":"48eb8bb6db75c8c59607d887031980a70cb5a48839967c0c06ad759cb47846bd"},{"key":"pin-definitions-1","sha256":"4e1f86b2c15b1e082985b0444d0f473a9075456e442dde050019e740d6848d15"},{"key":"pin-definitions-2","sha256":"e3c379d7cccbb8cfb00ed48e6c39add468586fa00f7744dc937add4652dfbb31"},{"key":"strapping-pins","sha256":"44c771acd5d1989a9658bbf002bb614d4974e4cccb82ac5f388d2de598467539"},{"key":"boot-mode","sha256":"7d08292a78443ff18d1b1285e96482b7a31c035d49fa0b9994cbe8bdde24ad45"},{"key":"peripherals-spi-uart-i2c","sha256":"366ac06312a63b1d62d8050a07792f8aea392d4fd83e07304cd9800f45ce97d7"},{"key":"abs-max-recommended","sha256":"aab0486c049d7744abe4ca8de49226937cc6a59c9ac1e00e86d28fec59e103e9"},{"key":"dc-characteristics-1","sha256":"fcf56338e755166ae1ab9cfe55d03cdd46dc1e5326f1b88c02050f57c84a5581"},{"key":"dc-characteristics-2","sha256":"7e75d27f6e681e6698592c305a65cd791074217c773bb54b2519aafd868fdadb"},{"key":"current-consumption","sha256":"0cc08347b2a3c7b445ecc8b3afaa834e625bf8f9e853aad796d7a0d3313d11d1"},{"key":"wifi-rf","sha256":"fcd5a054f0e1fe9fa157d547f5133c5de49043631211ad4a3bbfe2b7aec24a04"},{"key":"bluetooth-rf","sha256":"60559721c11a9a9bd6cf838ddcb461b29f277d12a14298740f29b1aa07e47aa1"}]}$t$,'dcf10f6040e629bee10d78459a98601d63521d5e93000343f5221c5bd34c5e2c','espressif-datasheet-excerpts-v1','386403f66ddfed7a20e2d02758e9bff83e6fd757cb34a89c208a52f03212b384','technical',NULL,'{"captured_at":"2026-11-13T00:00:00+00:00","rights":"vendor_datasheet_short_cited_excerpts_only","copyright_holder":"Espressif Systems","original_url":"https://documentation.espressif.com/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf","document":"ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet","document_version":"v2.1, 2026-08-05","method":"excerpts selected from the PDF text layer; tables transcribed from rendered pages and number-checked; owner requested 2026-11-13"}'::jsonb);
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='c24ef793-79b6-4918-8937-2ad78f690591' AND artifact_key='7b9c46e3e91c58ab5ea70ed3c369d49864319e38ebccdaf4962e839dd94f0491';
 FOR r IN SELECT * FROM (VALUES
 ('features','Features and key specifications','[2]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Features and key specifications. Page: 2. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features**

**CPU and On-Chip Memory**
- ESP32-D0WD-V3 or ESP32-D0WDR2-V3 embedded, Xtensa dual-core 32-bit LX6 microprocessor, up to 240 MHz
- 448 KB ROM
- 520 KB SRAM
- 16 KB SRAM in RTC

**Wi-Fi**
- 802.11b/g/n
- Bit rate: 802.11n up to 150 Mbps
- A-MPDU and A-MSDU aggregation
- 0.4 µs guard interval support
- Center frequency range of operating channel: 2412 ~ 2484 MHz

**Bluetooth®**
- Bluetooth V4.2 BR/EDR and Bluetooth LE specification
- Class-1, class-2 and class-3 transmitter
- AFH
- CVSD and SBC

**Peripherals**
- Up to 26 GPIOs
  - 5 strapping GPIOs
- SD card, UART, SPI, SDIO, I2C, LED PWM, Motor PWM, I2S, IR, pulse counter, GPIO, capacitive touch sensor, ADC, DAC, TWAI® (compatible with ISO 11898-1, i.e. CAN Specification 2.0)

**Integrated Components on Module**
- 40 MHz crystal oscillator
- 4/8/16 MB SPI flash
- ESP32-D0WDR2-V3 also provides 2 MB PSRAM

**Antenna Options**
- ESP32-WROOM-32E: On-board PCB antenna
- ESP32-WROOM-32UE: external antenna via a connector

**Operating Conditions**
- Operating voltage/Power supply: 3.0 ~ 3.6 V
- Operating ambient temperature:
  - 85 °C version: −40 ~ 85 °C
  - 105 °C version: −40 ~ 105 °C. Note that only the modules embedded with a 4/8 MB flash support this version.

**Certification**
- Bluetooth certification: BQB
- RF certification: See certificates for ESP32-WROOM-32E and ESP32-WROOM-32UE
- Green certification: REACH/RoHS

**Test**
- HTOL/HTSL/uHAST/TCT/ESD$t$),
 ('series-comparison-wroom-32e','Series comparison: ESP32-WROOM-32E variants','[3]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Series comparison: ESP32-WROOM-32E variants. Page: 3. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.2 Series Comparison**

ESP32-WROOM-32E and ESP32-WROOM-32UE are two powerful, generic Wi-Fi MCU modules that have a rich set of peripherals. They are an ideal choice for a wide variety of application scenarios related to Internet of Things (IoT), such as embedded systems, smart home, wearable electronics, etc.

ESP32-WROOM-32E comes with a PCB antenna, and ESP32-WROOM-32UE with a connector for an external antenna. The information in this datasheet is applicable to both modules.

The Series Comparison for the two modules is as follows:

**Table 1: ESP32-WROOM-32E Series Comparison (note 1)**

| Part Number | Flash (note 2) | PSRAM | Ambient Temp. (note 3) (°C) | Size (note 4) (mm) |
|---|---|---|---|---|
| ESP32-WROOM-32E-N4 | 4 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N8 | 8 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N16 | 16 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-H4 | 4 MB (Quad SPI) | — | −40 ~ 105 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-H8 | 8 MB (Quad SPI) | — | −40 ~ 105 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N4R2 | 4 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N8R2 | 8 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N16R2 | 16 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 25.5 × 3.1 |

(note 1) This table shares the same notes presented in the table 2 below.$t$),
 ('series-comparison-wroom-32ue','Series comparison: ESP32-WROOM-32UE variants and notes','[3]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Series comparison: ESP32-WROOM-32UE variants and notes. Page: 3. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 2: ESP32-WROOM-32UE Series Comparison**

| Part Number | Flash (note 2) | PSRAM | Ambient Temp. (note 3) (°C) | Size (note 4) (mm) |
|---|---|---|---|---|
| ESP32-WROOM-32UE-N4 | 4 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N8 | 8 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N16 | 16 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-H4 | 4 MB (Quad SPI) | — | −40 ~ 105 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-H8 | 8 MB (Quad SPI) | — | −40 ~ 105 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N4R2 | 4 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N8R2 | 8 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N16R2 | 16 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 19.2 × 3.2 |

(note 2) For specifications, refer to Section 6.5 Memory Specifications.
(note 3) Ambient temperature specifies the recommended temperature range of the environment immediately outside the Espressif module.
(note 4) For details, refer to Section 10.1 Module Dimensions.
(note 5) This module uses PSRAM integrated in the chip's package.

At the core of the module is the ESP32-D0WD-V3 chip or ESP32-D0WDR2-V3 chip. The chip embedded is designed to be scalable and adaptive. There are two CPU cores that can be individually controlled, and the CPU clock frequency is adjustable from 80 MHz to 240 MHz. You can power off the CPU and make use of the low-power coprocessor to constantly monitor the peripherals for changes or crossing of thresholds.$t$),
 ('pin-definitions-1','Pin definitions (part 1/2)','[11]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Pin definitions (part 1/2). Page: 11. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**3.2 Pin Description**

The module has 38 pins. See pin definitions in Table 3 Pin Description.

For peripheral pin configurations, please refer to Section 5.2 Digital Peripherals.

**Table 3: Pin Definitions**

| Name | No. | Type (note 1) | Function |
|---|---|---|---|
| GND | 1 | P | Ground |
| 3V3 | 2 | P | Power supply |
| EN | 3 | I | High: On; enables the chip / Low: Off; the chip shuts down / Note: Do not leave the pin floating. |
| SENSOR_VP | 4 | I | GPIO36, ADC1_CH0, RTC_GPIO0 |
| SENSOR_VN | 5 | I | GPIO39, ADC1_CH3, RTC_GPIO3 |
| IO34 | 6 | I | GPIO34, ADC1_CH6, RTC_GPIO4 |
| IO35 | 7 | I | GPIO35, ADC1_CH7, RTC_GPIO5 |
| IO32 | 8 | I/O | GPIO32, XTAL_32K_P (32.768 kHz crystal oscillator input), ADC1_CH4, TOUCH9, RTC_GPIO9 |
| IO33 | 9 | I/O | GPIO33, XTAL_32K_N (32.768 kHz crystal oscillator output), ADC1_CH5, TOUCH8, RTC_GPIO8 |
| IO25 | 10 | I/O | GPIO25, DAC_1, ADC2_CH8, RTC_GPIO6, EMAC_RXD0 |
| IO26 | 11 | I/O | GPIO26, DAC_2, ADC2_CH9, RTC_GPIO7, EMAC_RXD1 |
| IO27 | 12 | I/O | GPIO27, ADC2_CH7, TOUCH7, RTC_GPIO17, EMAC_RX_DV |
| IO14 | 13 | I/O | GPIO14, ADC2_CH6, TOUCH6, RTC_GPIO16, MTMS, HSPICLK, HS2_CLK, SD_CLK, EMAC_TXD2 |
| IO12 | 14 | I/O | GPIO12, ADC2_CH5, TOUCH5, RTC_GPIO15, MTDI, HSPIQ, HS2_DATA2, SD_DATA2, EMAC_TXD3 |
| GND | 15 | P | Ground |
| IO13 | 16 | I/O | GPIO13, ADC2_CH4, TOUCH4, RTC_GPIO14, MTCK, HSPID, HS2_DATA3, SD_DATA3, EMAC_RX_ER |

(Table 3 continues with pins 17 to 38.)$t$),
 ('pin-definitions-2','Pin definitions (part 2/2)','[11,12]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Pin definitions (part 2/2). Pages: 11, 12. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3: Pin Definitions (continued)**

| Name | No. | Type (note 1) | Function |
|---|---|---|---|
| NC | 17 | - | See note 2 |
| NC | 18 | - | See note 2 |
| NC | 19 | - | See note 2 |
| NC | 20 | - | See note 2 |
| NC | 21 | - | See note 2 |
| NC | 22 | - | See note 2 |
| IO15 | 23 | I/O | GPIO15, ADC2_CH3, TOUCH3, MTDO, HSPICS0, RTC_GPIO13, HS2_CMD, SD_CMD, EMAC_RXD3 |
| IO2 | 24 | I/O | GPIO2, ADC2_CH2, TOUCH2, RTC_GPIO12, HSPIWP, HS2_DATA0, SD_DATA0 |
| IO0 | 25 | I/O | GPIO0, ADC2_CH1, TOUCH1, RTC_GPIO11, CLK_OUT1, EMAC_TX_CLK |
| IO4 | 26 | I/O | GPIO4, ADC2_CH0, TOUCH0, RTC_GPIO10, HSPIHD, HS2_DATA1, SD_DATA1, EMAC_TX_ER |
| IO16 (note 3) | 27 | I/O | GPIO16, HS1_DATA4, U2RXD, EMAC_CLK_OUT |
| IO17 | 28 | I/O | GPIO17, HS1_DATA5, U2TXD, EMAC_CLK_OUT_180 |
| IO5 | 29 | I/O | GPIO5, VSPICS0, HS1_DATA6, EMAC_RX_CLK |
| IO18 | 30 | I/O | GPIO18, VSPICLK, HS1_DATA7 |
| IO19 | 31 | I/O | GPIO19, VSPIQ, U0CTS, EMAC_TXD0 |
| NC | 32 | - | - |
| IO21 | 33 | I/O | GPIO21, VSPIHD, EMAC_TX_EN |
| RXD0 | 34 | I/O | GPIO3, U0RXD, CLK_OUT2 |
| TXD0 | 35 | I/O | GPIO1, U0TXD, CLK_OUT3, EMAC_RXD2 |
| IO22 | 36 | I/O | GPIO22, VSPIWP, U0RTS, EMAC_TXD1 |
| IO23 | 37 | I/O | GPIO23, VSPID, HS1_STROBE |
| GND | 38 | P | Ground |

(note 1) P: power supply; I: input; O: output.
(note 2) Pins GPIO6 to GPIO11 on the ESP32-D0WD-V3/ESP32-D0WDR2-V3 chip are connected to the SPI flash integrated on the module and are not led out.
(note 3) In module variants that have embedded QSPI PSRAM, i.e., that embed ESP32-D0WDR2-V3, IO16 is connected to the embedded PSRAM and can not be used for other functions.$t$),
 ('strapping-pins','Strapping pins and defaults','[13]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Strapping pins and defaults. Page: 13. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4 Boot Configurations**

The chip allows for configuring the following boot parameters through strapping pins and eFuse bits at power-up or a hardware reset, without microcontroller interaction.

- Chip boot mode
  - Strapping pin: GPIO0 and GPIO2
- Internal LDO (VDD_SDIO) Voltage
  - Strapping pin: MTDI
  - eFuse bit: EFUSE_SDIO_FORCE and EFUSE_SDIO_TIEH
- U0TXD printing
  - Strapping pin: MTDO
- Timing of SDIO Slave
  - Strapping pin: MTDO and GPIO5
- JTAG signal source
  - eFuse bit: EFUSE_DISABLE_JTAG

The default values of all the above eFuse bits are 0, which means that they are not burnt. Given that eFuse is one-time programmable, once an eFuse bit is programmed to 1, it can never be reverted to 0. For how to program eFuse bits, please refer to ESP32 Technical Reference Manual > Chapter eFuse Controller.

The default values of the strapping pins, namely the logic levels, are determined by pins' internal weak pull-up/pull-down resistors at reset if the pins are not connected to any circuit, or connected to an external high-impedance circuit.

**Table 4: Default Configuration of Strapping Pins**

| Strapping Pin | Default Configuration | Bit Value |
|---|---|---|
| GPIO0 | Pull-up | 1 |
| GPIO2 | Pull-down | 0 |
| MTDI | Pull-down | 0 |
| MTDO | Pull-up | 1 |
| GPIO5 | Pull-up | 1 |

To change the bit values, the strapping pins should be connected to external pull-down/pull-up resistances. If the ESP32 is used as a device by a host MCU, the strapping pin voltage levels can also be controlled by the host MCU.$t$),
 ('boot-mode','Chip boot mode and download mode','[14,15]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Chip boot mode and download mode. Pages: 14, 15. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4.1 Chip Boot Mode Control**

GPIO0 and GPIO2 control the boot mode after the reset is released. See Table 6 Chip Boot Mode Control.

**Table 6: Chip Boot Mode Control**

| Boot Mode | GPIO0 | GPIO2 |
|---|---|---|
| **SPI Boot Mode** | **1** | **Any value** |
| Joint Download Boot Mode (note 2) | 0 | 0 |

(note 1) Bold marks the default value and configuration.
(note 2) Joint Download Boot mode supports the following download methods:
- SDIO Download Boot
- UART Download Boot

In Joint Download Boot mode, the detailed boot flow of the chip is put below 5.

uart_download_dis controls boot mode behaviors:

It permanently disables Download Boot mode when uart_download_dis is set to 1 (valid only for ESP32 chip revisions v3.0 and higher).$t$),
 ('peripherals-spi-uart-i2c','SPI, UART and I2C peripheral notes','[18,19]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: SPI, UART and I2C peripheral notes. Pages: 18, 19. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**5.2.2 Serial Peripheral Interface (SPI)**

ESP32 integrates four SPI controllers which can be used to communicate with external devices that use the SPI protocol. Controller SPI0 is used as a buffer for accessing external memory. Controller SPI1 can be used as a master. Controllers SPI2 and SPI3 can be configured as either a master or a slave.

SPI1, SPI2, and SPI3 use signal buses prefixed with SPI, HSPI, and VSPI, respectively.

**Features of General Purpose SPI (GP-SPI)**
- Programmable data transfer length, in multiples of 1 byte
- Four-line full-duplex/half-duplex communication and three-line half-duplex communication support
- Master mode and slave mode
- Programmable CPOL and CPHA
- Programmable clock

**Pin Assignment**

For SPI, the pins are multiplexed with GPIO6 ~ GPIO11 via the IO MUX. For HSPI, the pins are multiplexed with GPIO2, GPIO4, GPIO12 ~ GPIO15 via the IO MUX. For VSPI, the pins are multiplexed with GPIO5, GPIO18 ~ GPIO19, GPIO21 ~ GPIO23 via the IO MUX.

For more information about the pin assignment, see ESP32 Series Datasheet > Section Peripheral Pin Configurations and ESP32 Technical Reference Manual > Chapter IO_MUX and GPIO Matrix.

**5.2.3 Universal Asynchronous Receiver Transmitter (UART)**

ESP32 has three UART interfaces that facilitate the transmission and reception of asynchronous serial data between the chip and external UART devices.

**Feature List**
- Programmable baud rates up to 5 MBaud
- RAM shared by TX FIFOs and RX FIFOs
- Supports input baud rate self-check
- Support for various lengths of data bits and stop bits
- Parity bit support
- Asynchronous communication (RS232 and RS485) and IrDA support
- Supports DMA to communicate data in high speed
- Supports UART wake-up
- Supports both software and hardware flow control

**Pin Assignment**

The pins for UART can be chosen from any GPIOs via the GPIO Matrix.

For more information about the pin assignment, see ESP32 Series Datasheet > Section Peripheral Pin Configurations and ESP32 Technical Reference Manual > Chapter IO_MUX and GPIO Matrix.

**5.2.4 I2C Interface**

ESP32 has two I2C bus interfaces which can serve as I2C master or slave, depending on the user's configuration.

**Feature List**
- Standard mode (100 Kbit/s)
- Fast mode (400 Kbit/s)
- Up to 5 MHz, yet constrained by SDA pull-up strength$t$),
 ('abs-max-recommended','Absolute maximum ratings and recommended operating conditions','[28]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Absolute maximum ratings and recommended operating conditions. Page: 28. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.1 Absolute Maximum Ratings**

Stresses above those listed in Absolute Maximum Ratings may cause permanent damage to the device. These are stress ratings only and functional operation of the device at these or any other conditions beyond those indicated under Recommended Operating Conditions is not implied. Exposure to absolute-maximum-rated conditions for extended periods may affect device reliability.

**Table 13: Absolute Maximum Ratings**

| Symbol | Parameter | Min | Max | Unit |
|---|---|---|---|---|
| VDD33 | Power supply voltage | −0.3 | 3.6 | V |
| TSTORE | Storage temperature | −40 | 105 | °C |

* Please see Appendix IO MUX of ESP32 Series Datasheet for IO's power domain.

**6.2 Recommended Operating Conditions**

**Table 14: Recommended Operating Conditions**

| Symbol | Parameter | Condition | Min | Typ | Max | Unit |
|---|---|---|---|---|---|---|
| VDD33 | Power supply voltage | | 3.0 | 3.3 | 3.6 | V |
| IVDD | Current delivered by external power supply | | 0.5 | — | — | A |
| T | Operating ambient temperature | 85 °C version | −40 | — | 85 | °C |
| T | Operating ambient temperature | 105 °C version | −40 | — | 105 | °C |$t$),
 ('dc-characteristics-1','DC characteristics (part 1/2)','[28]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: DC characteristics (part 1/2). Page: 28. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.3 DC Characteristics (3.3 V, 25 °C)**

**Table 15: DC Characteristics (3.3 V, 25 °C)**

| Symbol | Parameter | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| CIN | Pin capacitance | — | 2 | — | pF |
| VIH | High-level input voltage | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| VIL | Low-level input voltage | −0.3 | — | 0.25 × VDD (note 1) | V |
| IIH | High-level input current | — | — | 50 | nA |
| IIL | Low-level input current | — | — | 50 | nA |
| VOH | High-level output voltage | 0.8 × VDD (note 1) | — | — | V |
| VOL | Low-level output voltage | — | — | 0.1 × VDD (note 1) | V |

(Table 15 continues on the next page.)$t$),
 ('dc-characteristics-2','DC characteristics (part 2/2)','[29]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: DC characteristics (part 2/2). Page: 29. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 15 – continued from previous page**

| Symbol | Parameter | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| IOH | High-level source current (VDD (note 1) = 3.3 V, VOH >= 2.64 V, output drive strength set to the maximum): VDD3P3_CPU power domain (notes 1, 2) | — | 40 | — | mA |
| IOH | High-level source current (VDD (note 1) = 3.3 V, VOH >= 2.64 V, output drive strength set to the maximum): VDD3P3_RTC power domain (notes 1, 2) | — | 40 | — | mA |
| IOH | High-level source current (VDD (note 1) = 3.3 V, VOH >= 2.64 V, output drive strength set to the maximum): VDD_SDIO power domain (notes 1, 3) | — | 20 | — | mA |
| IOL | Low-level sink current (VDD (note 1) = 3.3 V, VOL = 0.495 V, output drive strength set to the maximum) | — | 28 | — | mA |
| RPU | Resistance of internal pull-up resistor | — | 45 | — | kΩ |
| RPD | Resistance of internal pull-down resistor | — | 45 | — | kΩ |
| VIH_nRST | Chip reset release voltage (CHIP_PU voltage is within the specified range) | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| VIL_nRST | Low-level input voltage of CHIP_PU to shut down the chip | — | — | 0.6 | V |

(note 1) Please see Appendix IO MUX of ESP32 Series Datasheet for IO's power domain. VDD is the I/O voltage for a particular power domain of pins.
(note 2) For VDD3P3_CPU and VDD3P3_RTC power domain, per-pin current sourced in the same domain is gradually reduced from around 40 mA to around 29 mA, VOH >=2.64 V, as the number of current-source pins increases.
(note 3) Pins occupied by flash and/or PSRAM in the VDD_SDIO power domain were excluded from the test.$t$),
 ('current-consumption','Current consumption','[29]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Current consumption. Page: 29. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4 Current Consumption Characteristics**

Owing to the use of advanced power-management technologies, the module can switch between different power modes. For details on different power modes, please refer to Section RTC and Low-Power Management in ESP32 Series Datasheet.

The current consumption measurements are taken with a 3.3 V supply at 25 °C ambient temperature.

TX current consumption is rated at a 100% duty cycle.

RX current consumption is rated when the peripherals are disabled and the CPU idle.

**Table 16: Current Consumption Depending on RF Modes**

| Work mode | Description | | Average (mA) | Peak (mA) |
|---|---|---|---|---|
| Active (RF working) | TX | 802.11b, 20 MHz, 1 Mbps, @19.5 dBm | 239 | 379 |
| Active (RF working) | TX | 802.11g, 20 MHz, 54 Mbps, @15 dBm | 190 | 276 |
| Active (RF working) | TX | 802.11n, 20 MHz, MCS7, @13 dBm | 183 | 258 |
| Active (RF working) | TX | 802.11n, 40 MHz, MCS7, @13 dBm | 165 | 211 |
| Active (RF working) | RX | 802.11b/g/n, 20 MHz | 112 | 112 |
| Active (RF working) | RX | 802.11n, 40 MHz | 118 | 118 |$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte x32 ESP32 Development Board','Espressif ESP32-WROOM-32E datasheet',r.title);
  lg := encode(sha256(convert_to('["espx32-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='c24ef793-79b6-4918-8937-2ad78f690591' AND artifact_key='7b9c46e3e91c58ab5ea70ed3c369d49864319e38ebccdaf4962e839dd94f0491';
 FOR r IN SELECT * FROM (VALUES
 ('wifi-rf','Wi-Fi RF characteristics','[31]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Wi-Fi RF characteristics. Page: 31. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7 RF Characteristics**

This section contains tables with RF characteristics of the Espressif product.

The RF data is measured at the antenna port, where RF cable is connected, including the front-end loss. The external antennas used for the tests on the modules with external antenna connectors have an impedance of 50 Ω. Devices should operate in the center frequency range allocated by regional regulatory authorities. The target center frequency range and the target transmit power are configurable by software. See ESP RF Test Tool and Test Guide for instructions.

Unless otherwise stated, the RF tests are conducted with a 3.3 V (±5%) supply at 25 °C ambient temperature.

**7.1 Wi-Fi Radio**

**Table 19: Wi-Fi RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2412 ~ 2484 MHz |
| Wi-Fi wireless standard | IEEE 802.11b/g/n |

**7.1.1 Wi-Fi RF Transmitter (TX) Characteristics**

**Table 20: TX Power with Spectral Mask and EVM Meeting 802.11 Standards**

| Rate | Min (dBm) | Typ (dBm) | Max (dBm) |
|---|---|---|---|
| 802.11b, 1 Mbps | — | 19.5 | — |
| 802.11b, 11 Mbps | — | 19.5 | — |
| 802.11g, 6 Mbps | — | 18.0 | — |
| 802.11g, 54 Mbps | — | 14.0 | — |
| 802.11n, HT20, MCS0 | — | 18.0 | — |
| 802.11n, HT20, MCS7 | — | 13.0 | — |
| 802.11n, HT40, MCS0 | — | 18.0 | — |
| 802.11n, HT40, MCS7 | — | 13.0 | — |

**7.1.2 Wi-Fi RF Receiver (RX) Characteristics**

For RX tests, the PER (packet error rate) limit is 8% for 802.11b, and 10% for 802.11g/n.$t$),
 ('bluetooth-rf','Bluetooth radio characteristics','[33]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Bluetooth radio characteristics. Page: 33. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7.2 Bluetooth Radio**

**Table 24: Bluetooth LE RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2402 ~ 2480 MHz |
| RF transmit power range | −12.0 ~ 9.0 dBm |

**7.2.1 Receiver – Basic Data Rate**

**Table 25: Receiver Characteristics – Basic Data Rate**

| Parameter | Conditions | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| Sensitivity @0.1% BER | — | −90 | −89 | −88 | dBm |
| Maximum received signal @0.1% BER | — | 0 | — | — | dBm |
| Co-channel C/I | — | — | +7 | — | dB |
| Adjacent channel selectivity C/I | F = F0 + 1 MHz | — | — | −6 | dB |
| Adjacent channel selectivity C/I | F = F0 − 1 MHz | — | — | −6 | dB |
| Adjacent channel selectivity C/I | F = F0 + 2 MHz | — | — | −25 | dB |
| Adjacent channel selectivity C/I | F = F0 − 2 MHz | — | — | −33 | dB |
| Adjacent channel selectivity C/I | F = F0 + 3 MHz | — | — | −25 | dB |
| Adjacent channel selectivity C/I | F = F0 − 3 MHz | — | — | −45 | dB |
| Out-of-band blocking performance | 30 MHz ~ 2000 MHz | −10 | — | — | dBm |
| Out-of-band blocking performance | 2000 MHz ~ 2400 MHz | −27 | — | — | dBm |
| Out-of-band blocking performance | 2500 MHz ~ 3000 MHz | −27 | — | — | dBm |
| Out-of-band blocking performance | 3000 MHz ~ 12.5 GHz | −10 | — | — | dBm |
| Intermodulation | — | −36 | — | — | dBm |$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte x32 ESP32 Development Board','Espressif ESP32-WROOM-32E datasheet',r.title);
  lg := encode(sha256(convert_to('["espx32-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE v public.panda_agent_versions; n bigint; d text;
BEGIN
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE source_id='c24ef793-79b6-4918-8937-2ad78f690591' AND artifact_key='7b9c46e3e91c58ab5ea70ed3c369d49864319e38ebccdaf4962e839dd94f0491';
 IF v.state='approved' THEN RETURN; END IF;
 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(logical_chunk_id||':'||text_hash||':'||locator,E'\n' ORDER BY logical_chunk_id),''),'UTF8')),'hex') INTO n,d FROM public.panda_agent_chunks WHERE document_version_id=v.id;
 IF n<>14 THEN RAISE EXCEPTION 'ESPX32: % chunks, expected 14',n; END IF;
 PERFORM public.panda_agent_seal_version(v.id,v.version,n::int,d);
 PERFORM public.panda_agent_review_version(v.id,v.version+1,'approve','Owner requested Espressif datasheet excerpts on 2026-11-13; tables number-checked against the PDF text layer');
END $m$;
-- @@split
DO $m$ BEGIN
 PERFORM public.panda_agent_store_version('edc49796-f24c-4271-b7f4-07f7ca7bbbdc','dd4a4930-2e21-4e55-bf39-9bbf7d737382','6733eae2-9480-4b1c-b6b6-840dfda7c1b8',NULL,'15d514e8e9109e4c66eab88e2a5dfddaafce660a505aecdae29de6854b4cb0ee','4c7a345d1c1bfec34c38665639e39a7f43b79a35a12f6adcc2c7c0f83850f8b8',1230114,$t${"document":"ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet","version":"v2.1, 2026-08-05","source_url":"https://documentation.espressif.com/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf","pdf_sha256":"4c7a345d1c1bfec34c38665639e39a7f43b79a35a12f6adcc2c7c0f83850f8b8","excerpts":[{"key":"features","sha256":"24dbb22cc3ca241ad5f73bf02ec5799137d97ceffd2c70afbc9acd312f75a923"},{"key":"series-comparison-wroom-32e","sha256":"27a477111f66c2f372d3e8740cb1b4936b7fb38321a3837e69816c8798c19979"},{"key":"series-comparison-wroom-32ue","sha256":"48eb8bb6db75c8c59607d887031980a70cb5a48839967c0c06ad759cb47846bd"},{"key":"pin-definitions-1","sha256":"4e1f86b2c15b1e082985b0444d0f473a9075456e442dde050019e740d6848d15"},{"key":"pin-definitions-2","sha256":"e3c379d7cccbb8cfb00ed48e6c39add468586fa00f7744dc937add4652dfbb31"},{"key":"strapping-pins","sha256":"44c771acd5d1989a9658bbf002bb614d4974e4cccb82ac5f388d2de598467539"},{"key":"boot-mode","sha256":"7d08292a78443ff18d1b1285e96482b7a31c035d49fa0b9994cbe8bdde24ad45"},{"key":"peripherals-spi-uart-i2c","sha256":"366ac06312a63b1d62d8050a07792f8aea392d4fd83e07304cd9800f45ce97d7"},{"key":"abs-max-recommended","sha256":"aab0486c049d7744abe4ca8de49226937cc6a59c9ac1e00e86d28fec59e103e9"},{"key":"dc-characteristics-1","sha256":"fcf56338e755166ae1ab9cfe55d03cdd46dc1e5326f1b88c02050f57c84a5581"},{"key":"dc-characteristics-2","sha256":"7e75d27f6e681e6698592c305a65cd791074217c773bb54b2519aafd868fdadb"},{"key":"current-consumption","sha256":"0cc08347b2a3c7b445ecc8b3afaa834e625bf8f9e853aad796d7a0d3313d11d1"},{"key":"wifi-rf","sha256":"fcd5a054f0e1fe9fa157d547f5133c5de49043631211ad4a3bbfe2b7aec24a04"},{"key":"bluetooth-rf","sha256":"60559721c11a9a9bd6cf838ddcb461b29f277d12a14298740f29b1aa07e47aa1"}]}$t$,'dcf10f6040e629bee10d78459a98601d63521d5e93000343f5221c5bd34c5e2c','espressif-datasheet-excerpts-v1','386403f66ddfed7a20e2d02758e9bff83e6fd757cb34a89c208a52f03212b384','technical',NULL,'{"captured_at":"2026-11-13T00:00:00+00:00","rights":"vendor_datasheet_short_cited_excerpts_only","copyright_holder":"Espressif Systems","original_url":"https://documentation.espressif.com/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf","document":"ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet","document_version":"v2.1, 2026-08-05","method":"excerpts selected from the PDF text layer; tables transcribed from rendered pages and number-checked; owner requested 2026-11-13"}'::jsonb);
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='edc49796-f24c-4271-b7f4-07f7ca7bbbdc' AND artifact_key='15d514e8e9109e4c66eab88e2a5dfddaafce660a505aecdae29de6854b4cb0ee';
 FOR r IN SELECT * FROM (VALUES
 ('features','Features and key specifications','[2]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Features and key specifications. Page: 2. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features**

**CPU and On-Chip Memory**
- ESP32-D0WD-V3 or ESP32-D0WDR2-V3 embedded, Xtensa dual-core 32-bit LX6 microprocessor, up to 240 MHz
- 448 KB ROM
- 520 KB SRAM
- 16 KB SRAM in RTC

**Wi-Fi**
- 802.11b/g/n
- Bit rate: 802.11n up to 150 Mbps
- A-MPDU and A-MSDU aggregation
- 0.4 µs guard interval support
- Center frequency range of operating channel: 2412 ~ 2484 MHz

**Bluetooth®**
- Bluetooth V4.2 BR/EDR and Bluetooth LE specification
- Class-1, class-2 and class-3 transmitter
- AFH
- CVSD and SBC

**Peripherals**
- Up to 26 GPIOs
  - 5 strapping GPIOs
- SD card, UART, SPI, SDIO, I2C, LED PWM, Motor PWM, I2S, IR, pulse counter, GPIO, capacitive touch sensor, ADC, DAC, TWAI® (compatible with ISO 11898-1, i.e. CAN Specification 2.0)

**Integrated Components on Module**
- 40 MHz crystal oscillator
- 4/8/16 MB SPI flash
- ESP32-D0WDR2-V3 also provides 2 MB PSRAM

**Antenna Options**
- ESP32-WROOM-32E: On-board PCB antenna
- ESP32-WROOM-32UE: external antenna via a connector

**Operating Conditions**
- Operating voltage/Power supply: 3.0 ~ 3.6 V
- Operating ambient temperature:
  - 85 °C version: −40 ~ 85 °C
  - 105 °C version: −40 ~ 105 °C. Note that only the modules embedded with a 4/8 MB flash support this version.

**Certification**
- Bluetooth certification: BQB
- RF certification: See certificates for ESP32-WROOM-32E and ESP32-WROOM-32UE
- Green certification: REACH/RoHS

**Test**
- HTOL/HTSL/uHAST/TCT/ESD$t$),
 ('series-comparison-wroom-32e','Series comparison: ESP32-WROOM-32E variants','[3]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Series comparison: ESP32-WROOM-32E variants. Page: 3. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.2 Series Comparison**

ESP32-WROOM-32E and ESP32-WROOM-32UE are two powerful, generic Wi-Fi MCU modules that have a rich set of peripherals. They are an ideal choice for a wide variety of application scenarios related to Internet of Things (IoT), such as embedded systems, smart home, wearable electronics, etc.

ESP32-WROOM-32E comes with a PCB antenna, and ESP32-WROOM-32UE with a connector for an external antenna. The information in this datasheet is applicable to both modules.

The Series Comparison for the two modules is as follows:

**Table 1: ESP32-WROOM-32E Series Comparison (note 1)**

| Part Number | Flash (note 2) | PSRAM | Ambient Temp. (note 3) (°C) | Size (note 4) (mm) |
|---|---|---|---|---|
| ESP32-WROOM-32E-N4 | 4 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N8 | 8 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N16 | 16 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-H4 | 4 MB (Quad SPI) | — | −40 ~ 105 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-H8 | 8 MB (Quad SPI) | — | −40 ~ 105 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N4R2 | 4 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N8R2 | 8 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-WROOM-32E-N16R2 | 16 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 25.5 × 3.1 |

(note 1) This table shares the same notes presented in the table 2 below.$t$),
 ('series-comparison-wroom-32ue','Series comparison: ESP32-WROOM-32UE variants and notes','[3]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Series comparison: ESP32-WROOM-32UE variants and notes. Page: 3. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 2: ESP32-WROOM-32UE Series Comparison**

| Part Number | Flash (note 2) | PSRAM | Ambient Temp. (note 3) (°C) | Size (note 4) (mm) |
|---|---|---|---|---|
| ESP32-WROOM-32UE-N4 | 4 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N8 | 8 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N16 | 16 MB (Quad SPI) | — | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-H4 | 4 MB (Quad SPI) | — | −40 ~ 105 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-H8 | 8 MB (Quad SPI) | — | −40 ~ 105 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N4R2 | 4 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N8R2 | 8 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-WROOM-32UE-N16R2 | 16 MB (Quad SPI) | 2 MB (Quad SPI) (note 5) | −40 ~ 85 | 18.0 × 19.2 × 3.2 |

(note 2) For specifications, refer to Section 6.5 Memory Specifications.
(note 3) Ambient temperature specifies the recommended temperature range of the environment immediately outside the Espressif module.
(note 4) For details, refer to Section 10.1 Module Dimensions.
(note 5) This module uses PSRAM integrated in the chip's package.

At the core of the module is the ESP32-D0WD-V3 chip or ESP32-D0WDR2-V3 chip. The chip embedded is designed to be scalable and adaptive. There are two CPU cores that can be individually controlled, and the CPU clock frequency is adjustable from 80 MHz to 240 MHz. You can power off the CPU and make use of the low-power coprocessor to constantly monitor the peripherals for changes or crossing of thresholds.$t$),
 ('pin-definitions-1','Pin definitions (part 1/2)','[11]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Pin definitions (part 1/2). Page: 11. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**3.2 Pin Description**

The module has 38 pins. See pin definitions in Table 3 Pin Description.

For peripheral pin configurations, please refer to Section 5.2 Digital Peripherals.

**Table 3: Pin Definitions**

| Name | No. | Type (note 1) | Function |
|---|---|---|---|
| GND | 1 | P | Ground |
| 3V3 | 2 | P | Power supply |
| EN | 3 | I | High: On; enables the chip / Low: Off; the chip shuts down / Note: Do not leave the pin floating. |
| SENSOR_VP | 4 | I | GPIO36, ADC1_CH0, RTC_GPIO0 |
| SENSOR_VN | 5 | I | GPIO39, ADC1_CH3, RTC_GPIO3 |
| IO34 | 6 | I | GPIO34, ADC1_CH6, RTC_GPIO4 |
| IO35 | 7 | I | GPIO35, ADC1_CH7, RTC_GPIO5 |
| IO32 | 8 | I/O | GPIO32, XTAL_32K_P (32.768 kHz crystal oscillator input), ADC1_CH4, TOUCH9, RTC_GPIO9 |
| IO33 | 9 | I/O | GPIO33, XTAL_32K_N (32.768 kHz crystal oscillator output), ADC1_CH5, TOUCH8, RTC_GPIO8 |
| IO25 | 10 | I/O | GPIO25, DAC_1, ADC2_CH8, RTC_GPIO6, EMAC_RXD0 |
| IO26 | 11 | I/O | GPIO26, DAC_2, ADC2_CH9, RTC_GPIO7, EMAC_RXD1 |
| IO27 | 12 | I/O | GPIO27, ADC2_CH7, TOUCH7, RTC_GPIO17, EMAC_RX_DV |
| IO14 | 13 | I/O | GPIO14, ADC2_CH6, TOUCH6, RTC_GPIO16, MTMS, HSPICLK, HS2_CLK, SD_CLK, EMAC_TXD2 |
| IO12 | 14 | I/O | GPIO12, ADC2_CH5, TOUCH5, RTC_GPIO15, MTDI, HSPIQ, HS2_DATA2, SD_DATA2, EMAC_TXD3 |
| GND | 15 | P | Ground |
| IO13 | 16 | I/O | GPIO13, ADC2_CH4, TOUCH4, RTC_GPIO14, MTCK, HSPID, HS2_DATA3, SD_DATA3, EMAC_RX_ER |

(Table 3 continues with pins 17 to 38.)$t$),
 ('pin-definitions-2','Pin definitions (part 2/2)','[11,12]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Pin definitions (part 2/2). Pages: 11, 12. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3: Pin Definitions (continued)**

| Name | No. | Type (note 1) | Function |
|---|---|---|---|
| NC | 17 | - | See note 2 |
| NC | 18 | - | See note 2 |
| NC | 19 | - | See note 2 |
| NC | 20 | - | See note 2 |
| NC | 21 | - | See note 2 |
| NC | 22 | - | See note 2 |
| IO15 | 23 | I/O | GPIO15, ADC2_CH3, TOUCH3, MTDO, HSPICS0, RTC_GPIO13, HS2_CMD, SD_CMD, EMAC_RXD3 |
| IO2 | 24 | I/O | GPIO2, ADC2_CH2, TOUCH2, RTC_GPIO12, HSPIWP, HS2_DATA0, SD_DATA0 |
| IO0 | 25 | I/O | GPIO0, ADC2_CH1, TOUCH1, RTC_GPIO11, CLK_OUT1, EMAC_TX_CLK |
| IO4 | 26 | I/O | GPIO4, ADC2_CH0, TOUCH0, RTC_GPIO10, HSPIHD, HS2_DATA1, SD_DATA1, EMAC_TX_ER |
| IO16 (note 3) | 27 | I/O | GPIO16, HS1_DATA4, U2RXD, EMAC_CLK_OUT |
| IO17 | 28 | I/O | GPIO17, HS1_DATA5, U2TXD, EMAC_CLK_OUT_180 |
| IO5 | 29 | I/O | GPIO5, VSPICS0, HS1_DATA6, EMAC_RX_CLK |
| IO18 | 30 | I/O | GPIO18, VSPICLK, HS1_DATA7 |
| IO19 | 31 | I/O | GPIO19, VSPIQ, U0CTS, EMAC_TXD0 |
| NC | 32 | - | - |
| IO21 | 33 | I/O | GPIO21, VSPIHD, EMAC_TX_EN |
| RXD0 | 34 | I/O | GPIO3, U0RXD, CLK_OUT2 |
| TXD0 | 35 | I/O | GPIO1, U0TXD, CLK_OUT3, EMAC_RXD2 |
| IO22 | 36 | I/O | GPIO22, VSPIWP, U0RTS, EMAC_TXD1 |
| IO23 | 37 | I/O | GPIO23, VSPID, HS1_STROBE |
| GND | 38 | P | Ground |

(note 1) P: power supply; I: input; O: output.
(note 2) Pins GPIO6 to GPIO11 on the ESP32-D0WD-V3/ESP32-D0WDR2-V3 chip are connected to the SPI flash integrated on the module and are not led out.
(note 3) In module variants that have embedded QSPI PSRAM, i.e., that embed ESP32-D0WDR2-V3, IO16 is connected to the embedded PSRAM and can not be used for other functions.$t$),
 ('strapping-pins','Strapping pins and defaults','[13]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Strapping pins and defaults. Page: 13. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4 Boot Configurations**

The chip allows for configuring the following boot parameters through strapping pins and eFuse bits at power-up or a hardware reset, without microcontroller interaction.

- Chip boot mode
  - Strapping pin: GPIO0 and GPIO2
- Internal LDO (VDD_SDIO) Voltage
  - Strapping pin: MTDI
  - eFuse bit: EFUSE_SDIO_FORCE and EFUSE_SDIO_TIEH
- U0TXD printing
  - Strapping pin: MTDO
- Timing of SDIO Slave
  - Strapping pin: MTDO and GPIO5
- JTAG signal source
  - eFuse bit: EFUSE_DISABLE_JTAG

The default values of all the above eFuse bits are 0, which means that they are not burnt. Given that eFuse is one-time programmable, once an eFuse bit is programmed to 1, it can never be reverted to 0. For how to program eFuse bits, please refer to ESP32 Technical Reference Manual > Chapter eFuse Controller.

The default values of the strapping pins, namely the logic levels, are determined by pins' internal weak pull-up/pull-down resistors at reset if the pins are not connected to any circuit, or connected to an external high-impedance circuit.

**Table 4: Default Configuration of Strapping Pins**

| Strapping Pin | Default Configuration | Bit Value |
|---|---|---|
| GPIO0 | Pull-up | 1 |
| GPIO2 | Pull-down | 0 |
| MTDI | Pull-down | 0 |
| MTDO | Pull-up | 1 |
| GPIO5 | Pull-up | 1 |

To change the bit values, the strapping pins should be connected to external pull-down/pull-up resistances. If the ESP32 is used as a device by a host MCU, the strapping pin voltage levels can also be controlled by the host MCU.$t$),
 ('boot-mode','Chip boot mode and download mode','[14,15]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Chip boot mode and download mode. Pages: 14, 15. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4.1 Chip Boot Mode Control**

GPIO0 and GPIO2 control the boot mode after the reset is released. See Table 6 Chip Boot Mode Control.

**Table 6: Chip Boot Mode Control**

| Boot Mode | GPIO0 | GPIO2 |
|---|---|---|
| **SPI Boot Mode** | **1** | **Any value** |
| Joint Download Boot Mode (note 2) | 0 | 0 |

(note 1) Bold marks the default value and configuration.
(note 2) Joint Download Boot mode supports the following download methods:
- SDIO Download Boot
- UART Download Boot

In Joint Download Boot mode, the detailed boot flow of the chip is put below 5.

uart_download_dis controls boot mode behaviors:

It permanently disables Download Boot mode when uart_download_dis is set to 1 (valid only for ESP32 chip revisions v3.0 and higher).$t$),
 ('peripherals-spi-uart-i2c','SPI, UART and I2C peripheral notes','[18,19]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: SPI, UART and I2C peripheral notes. Pages: 18, 19. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**5.2.2 Serial Peripheral Interface (SPI)**

ESP32 integrates four SPI controllers which can be used to communicate with external devices that use the SPI protocol. Controller SPI0 is used as a buffer for accessing external memory. Controller SPI1 can be used as a master. Controllers SPI2 and SPI3 can be configured as either a master or a slave.

SPI1, SPI2, and SPI3 use signal buses prefixed with SPI, HSPI, and VSPI, respectively.

**Features of General Purpose SPI (GP-SPI)**
- Programmable data transfer length, in multiples of 1 byte
- Four-line full-duplex/half-duplex communication and three-line half-duplex communication support
- Master mode and slave mode
- Programmable CPOL and CPHA
- Programmable clock

**Pin Assignment**

For SPI, the pins are multiplexed with GPIO6 ~ GPIO11 via the IO MUX. For HSPI, the pins are multiplexed with GPIO2, GPIO4, GPIO12 ~ GPIO15 via the IO MUX. For VSPI, the pins are multiplexed with GPIO5, GPIO18 ~ GPIO19, GPIO21 ~ GPIO23 via the IO MUX.

For more information about the pin assignment, see ESP32 Series Datasheet > Section Peripheral Pin Configurations and ESP32 Technical Reference Manual > Chapter IO_MUX and GPIO Matrix.

**5.2.3 Universal Asynchronous Receiver Transmitter (UART)**

ESP32 has three UART interfaces that facilitate the transmission and reception of asynchronous serial data between the chip and external UART devices.

**Feature List**
- Programmable baud rates up to 5 MBaud
- RAM shared by TX FIFOs and RX FIFOs
- Supports input baud rate self-check
- Support for various lengths of data bits and stop bits
- Parity bit support
- Asynchronous communication (RS232 and RS485) and IrDA support
- Supports DMA to communicate data in high speed
- Supports UART wake-up
- Supports both software and hardware flow control

**Pin Assignment**

The pins for UART can be chosen from any GPIOs via the GPIO Matrix.

For more information about the pin assignment, see ESP32 Series Datasheet > Section Peripheral Pin Configurations and ESP32 Technical Reference Manual > Chapter IO_MUX and GPIO Matrix.

**5.2.4 I2C Interface**

ESP32 has two I2C bus interfaces which can serve as I2C master or slave, depending on the user's configuration.

**Feature List**
- Standard mode (100 Kbit/s)
- Fast mode (400 Kbit/s)
- Up to 5 MHz, yet constrained by SDA pull-up strength$t$),
 ('abs-max-recommended','Absolute maximum ratings and recommended operating conditions','[28]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Absolute maximum ratings and recommended operating conditions. Page: 28. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.1 Absolute Maximum Ratings**

Stresses above those listed in Absolute Maximum Ratings may cause permanent damage to the device. These are stress ratings only and functional operation of the device at these or any other conditions beyond those indicated under Recommended Operating Conditions is not implied. Exposure to absolute-maximum-rated conditions for extended periods may affect device reliability.

**Table 13: Absolute Maximum Ratings**

| Symbol | Parameter | Min | Max | Unit |
|---|---|---|---|---|
| VDD33 | Power supply voltage | −0.3 | 3.6 | V |
| TSTORE | Storage temperature | −40 | 105 | °C |

* Please see Appendix IO MUX of ESP32 Series Datasheet for IO's power domain.

**6.2 Recommended Operating Conditions**

**Table 14: Recommended Operating Conditions**

| Symbol | Parameter | Condition | Min | Typ | Max | Unit |
|---|---|---|---|---|---|---|
| VDD33 | Power supply voltage | | 3.0 | 3.3 | 3.6 | V |
| IVDD | Current delivered by external power supply | | 0.5 | — | — | A |
| T | Operating ambient temperature | 85 °C version | −40 | — | 85 | °C |
| T | Operating ambient temperature | 105 °C version | −40 | — | 105 | °C |$t$),
 ('dc-characteristics-1','DC characteristics (part 1/2)','[28]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: DC characteristics (part 1/2). Page: 28. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.3 DC Characteristics (3.3 V, 25 °C)**

**Table 15: DC Characteristics (3.3 V, 25 °C)**

| Symbol | Parameter | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| CIN | Pin capacitance | — | 2 | — | pF |
| VIH | High-level input voltage | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| VIL | Low-level input voltage | −0.3 | — | 0.25 × VDD (note 1) | V |
| IIH | High-level input current | — | — | 50 | nA |
| IIL | Low-level input current | — | — | 50 | nA |
| VOH | High-level output voltage | 0.8 × VDD (note 1) | — | — | V |
| VOL | Low-level output voltage | — | — | 0.1 × VDD (note 1) | V |

(Table 15 continues on the next page.)$t$),
 ('dc-characteristics-2','DC characteristics (part 2/2)','[29]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: DC characteristics (part 2/2). Page: 29. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 15 – continued from previous page**

| Symbol | Parameter | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| IOH | High-level source current (VDD (note 1) = 3.3 V, VOH >= 2.64 V, output drive strength set to the maximum): VDD3P3_CPU power domain (notes 1, 2) | — | 40 | — | mA |
| IOH | High-level source current (VDD (note 1) = 3.3 V, VOH >= 2.64 V, output drive strength set to the maximum): VDD3P3_RTC power domain (notes 1, 2) | — | 40 | — | mA |
| IOH | High-level source current (VDD (note 1) = 3.3 V, VOH >= 2.64 V, output drive strength set to the maximum): VDD_SDIO power domain (notes 1, 3) | — | 20 | — | mA |
| IOL | Low-level sink current (VDD (note 1) = 3.3 V, VOL = 0.495 V, output drive strength set to the maximum) | — | 28 | — | mA |
| RPU | Resistance of internal pull-up resistor | — | 45 | — | kΩ |
| RPD | Resistance of internal pull-down resistor | — | 45 | — | kΩ |
| VIH_nRST | Chip reset release voltage (CHIP_PU voltage is within the specified range) | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| VIL_nRST | Low-level input voltage of CHIP_PU to shut down the chip | — | — | 0.6 | V |

(note 1) Please see Appendix IO MUX of ESP32 Series Datasheet for IO's power domain. VDD is the I/O voltage for a particular power domain of pins.
(note 2) For VDD3P3_CPU and VDD3P3_RTC power domain, per-pin current sourced in the same domain is gradually reduced from around 40 mA to around 29 mA, VOH >=2.64 V, as the number of current-source pins increases.
(note 3) Pins occupied by flash and/or PSRAM in the VDD_SDIO power domain were excluded from the test.$t$),
 ('current-consumption','Current consumption','[29]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Current consumption. Page: 29. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4 Current Consumption Characteristics**

Owing to the use of advanced power-management technologies, the module can switch between different power modes. For details on different power modes, please refer to Section RTC and Low-Power Management in ESP32 Series Datasheet.

The current consumption measurements are taken with a 3.3 V supply at 25 °C ambient temperature.

TX current consumption is rated at a 100% duty cycle.

RX current consumption is rated when the peripherals are disabled and the CPU idle.

**Table 16: Current Consumption Depending on RF Modes**

| Work mode | Description | | Average (mA) | Peak (mA) |
|---|---|---|---|---|
| Active (RF working) | TX | 802.11b, 20 MHz, 1 Mbps, @19.5 dBm | 239 | 379 |
| Active (RF working) | TX | 802.11g, 20 MHz, 54 Mbps, @15 dBm | 190 | 276 |
| Active (RF working) | TX | 802.11n, 20 MHz, MCS7, @13 dBm | 183 | 258 |
| Active (RF working) | TX | 802.11n, 40 MHz, MCS7, @13 dBm | 165 | 211 |
| Active (RF working) | RX | 802.11b/g/n, 20 MHz | 112 | 112 |
| Active (RF working) | RX | 802.11n, 40 MHz | 118 | 118 |$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xLoRa ESP32 LoRaWAN Development Board with Battery and Solar','Espressif ESP32-WROOM-32E datasheet',r.title);
  lg := encode(sha256(convert_to('["xlora-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='edc49796-f24c-4271-b7f4-07f7ca7bbbdc' AND artifact_key='15d514e8e9109e4c66eab88e2a5dfddaafce660a505aecdae29de6854b4cb0ee';
 FOR r IN SELECT * FROM (VALUES
 ('wifi-rf','Wi-Fi RF characteristics','[31]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Wi-Fi RF characteristics. Page: 31. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7 RF Characteristics**

This section contains tables with RF characteristics of the Espressif product.

The RF data is measured at the antenna port, where RF cable is connected, including the front-end loss. The external antennas used for the tests on the modules with external antenna connectors have an impedance of 50 Ω. Devices should operate in the center frequency range allocated by regional regulatory authorities. The target center frequency range and the target transmit power are configurable by software. See ESP RF Test Tool and Test Guide for instructions.

Unless otherwise stated, the RF tests are conducted with a 3.3 V (±5%) supply at 25 °C ambient temperature.

**7.1 Wi-Fi Radio**

**Table 19: Wi-Fi RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2412 ~ 2484 MHz |
| Wi-Fi wireless standard | IEEE 802.11b/g/n |

**7.1.1 Wi-Fi RF Transmitter (TX) Characteristics**

**Table 20: TX Power with Spectral Mask and EVM Meeting 802.11 Standards**

| Rate | Min (dBm) | Typ (dBm) | Max (dBm) |
|---|---|---|---|
| 802.11b, 1 Mbps | — | 19.5 | — |
| 802.11b, 11 Mbps | — | 19.5 | — |
| 802.11g, 6 Mbps | — | 18.0 | — |
| 802.11g, 54 Mbps | — | 14.0 | — |
| 802.11n, HT20, MCS0 | — | 18.0 | — |
| 802.11n, HT20, MCS7 | — | 13.0 | — |
| 802.11n, HT40, MCS0 | — | 18.0 | — |
| 802.11n, HT40, MCS7 | — | 13.0 | — |

**7.1.2 Wi-Fi RF Receiver (RX) Characteristics**

For RX tests, the PER (packet error rate) limit is 8% for 802.11b, and 10% for 802.11g/n.$t$),
 ('bluetooth-rf','Bluetooth radio characteristics','[33]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-WROOM-32E and ESP32-WROOM-32UE Datasheet, v2.1, 2026-08-05. Section: Bluetooth radio characteristics. Page: 33. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7.2 Bluetooth Radio**

**Table 24: Bluetooth LE RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2402 ~ 2480 MHz |
| RF transmit power range | −12.0 ~ 9.0 dBm |

**7.2.1 Receiver – Basic Data Rate**

**Table 25: Receiver Characteristics – Basic Data Rate**

| Parameter | Conditions | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| Sensitivity @0.1% BER | — | −90 | −89 | −88 | dBm |
| Maximum received signal @0.1% BER | — | 0 | — | — | dBm |
| Co-channel C/I | — | — | +7 | — | dB |
| Adjacent channel selectivity C/I | F = F0 + 1 MHz | — | — | −6 | dB |
| Adjacent channel selectivity C/I | F = F0 − 1 MHz | — | — | −6 | dB |
| Adjacent channel selectivity C/I | F = F0 + 2 MHz | — | — | −25 | dB |
| Adjacent channel selectivity C/I | F = F0 − 2 MHz | — | — | −33 | dB |
| Adjacent channel selectivity C/I | F = F0 + 3 MHz | — | — | −25 | dB |
| Adjacent channel selectivity C/I | F = F0 − 3 MHz | — | — | −45 | dB |
| Out-of-band blocking performance | 30 MHz ~ 2000 MHz | −10 | — | — | dBm |
| Out-of-band blocking performance | 2000 MHz ~ 2400 MHz | −27 | — | — | dBm |
| Out-of-band blocking performance | 2500 MHz ~ 3000 MHz | −27 | — | — | dBm |
| Out-of-band blocking performance | 3000 MHz ~ 12.5 GHz | −10 | — | — | dBm |
| Intermodulation | — | −36 | — | — | dBm |$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xLoRa ESP32 LoRaWAN Development Board with Battery and Solar','Espressif ESP32-WROOM-32E datasheet',r.title);
  lg := encode(sha256(convert_to('["xlora-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE v public.panda_agent_versions; n bigint; d text;
BEGIN
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE source_id='edc49796-f24c-4271-b7f4-07f7ca7bbbdc' AND artifact_key='15d514e8e9109e4c66eab88e2a5dfddaafce660a505aecdae29de6854b4cb0ee';
 IF v.state='approved' THEN RETURN; END IF;
 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(logical_chunk_id||':'||text_hash||':'||locator,E'\n' ORDER BY logical_chunk_id),''),'UTF8')),'hex') INTO n,d FROM public.panda_agent_chunks WHERE document_version_id=v.id;
 IF n<>14 THEN RAISE EXCEPTION 'XLORA: % chunks, expected 14',n; END IF;
 PERFORM public.panda_agent_seal_version(v.id,v.version,n::int,d);
 PERFORM public.panda_agent_review_version(v.id,v.version+1,'approve','Owner requested Espressif datasheet excerpts on 2026-11-13; tables number-checked against the PDF text layer');
END $m$;
-- @@split
DO $m$ BEGIN
 PERFORM public.panda_agent_store_version('7d3c3265-756c-4462-a062-5528218798a2','d0f30193-c808-4c43-8cd9-8a71ea8ed2fb','f642bf30-2a72-42c0-b268-00c610252328',NULL,'3c93a309b9611d0b200372a8d0d6a5402450c52a3c75c8dcc429bf80a067488d','fa50f329237226d09c5b53460e65d8a2561c58fb5fb08945c12990a2c61f8e9e',1600673,$t${"document":"ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet","version":"v1.3, 2026-09-03","source_url":"https://documentation.espressif.com/esp32-c5-wroom-1_wroom-1u_datasheet_en.pdf","pdf_sha256":"fa50f329237226d09c5b53460e65d8a2561c58fb5fb08945c12990a2c61f8e9e","excerpts":[{"key":"features-cpu-wifi-bluetooth","sha256":"cda47fd31e5aa5dce0c2ea35093a957f97e9027bdb2e2c10955dbc6956f7c0af"},{"key":"features-802154-peripherals-antenna","sha256":"592b5c43ef306d168d1ea35dffe22564a6a8bee933b5c2053939d390f839d129"},{"key":"part-numbers-flash-psram-antenna","sha256":"4743df4078a00f3b63811588741b16df726d97be61b1995c5c32beb473c69a1c"},{"key":"pin-definitions-1","sha256":"7cc6db204e8181a6ef326aea856abb21323e262f991e48286e09382cbf079dce"},{"key":"pin-definitions-2","sha256":"47b6db259c4ffcabb5cd6952caedc093729bcb70d9826d0f0c6973e474165ed5"},{"key":"pin-definitions-2--2","sha256":"adec46523c9b023310da2cd22f264e20fd09705a396305632cd8a38a59dbaff3"},{"key":"pin-definitions-2--3","sha256":"46938005eacf29b5037d8f1489a39e90a08d5e8f63fedb4cd1e068fe69909e16"},{"key":"strapping-pins","sha256":"d31f0ceb402c6ecfaff6b56675a4f8161bb22686fc02552dfea881c2060c64b1"},{"key":"boot-mode-download","sha256":"08093cea2f93bf7d97677944d6616602ef4d5ec5abf1236a7cf93c5da89ce5cc"},{"key":"ratings-operating-conditions","sha256":"d79a83d1da8108f1b297bbfd9ccdbdfcc25fbf10636b8ce19ec8f1491dbf387a"},{"key":"dc-characteristics","sha256":"b7c180944f4c769f8188f1165a35a4ccf40b7c0266d8107b56149ab00719d89d"},{"key":"current-wifi-active","sha256":"823b2840197d4a73b13316d5f24044991a580944c9dc35750bd4357e73e2588f"},{"key":"current-ble-154-sleep","sha256":"6e3283c84bb64827a6bedd3f40d08b9ad755ad3d09f88a26cbb2e6fb6c438423"},{"key":"rf-wifi-tx-power","sha256":"e3ac803569dee0807f3ccf91647371d21cd9709b10b08410152f812773947929"},{"key":"rf-wifi-rx-sensitivity","sha256":"4c509d559b69c667b372c06129cbfe81388ab47b7fca074e7fc7f07c35c980d5"},{"key":"rf-ble-802154","sha256":"6a6a72e495934cc88fab25711068016a55e77569aebebb2620e053690b9c5889"}]}$t$,'3f2fd515f15ee13b75ea26a5b95b2e4cdbd041d99080dd0fbd78e61cdaf1fe53','espressif-datasheet-excerpts-v1','386403f66ddfed7a20e2d02758e9bff83e6fd757cb34a89c208a52f03212b384','technical',NULL,'{"captured_at":"2026-11-13T00:00:00+00:00","rights":"vendor_datasheet_short_cited_excerpts_only","copyright_holder":"Espressif Systems","original_url":"https://documentation.espressif.com/esp32-c5-wroom-1_wroom-1u_datasheet_en.pdf","document":"ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet","document_version":"v1.3, 2026-09-03","method":"excerpts selected from the PDF text layer; tables transcribed from rendered pages and number-checked; owner requested 2026-11-13"}'::jsonb);
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='7d3c3265-756c-4462-a062-5528218798a2' AND artifact_key='3c93a309b9611d0b200372a8d0d6a5402450c52a3c75c8dcc429bf80a067488d';
 FOR r IN SELECT * FROM (VALUES
 ('features-cpu-wifi-bluetooth','Features: CPU, memory, Wi-Fi 6 dual-band, Bluetooth LE','[2]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Features: CPU, memory, Wi-Fi 6 dual-band, Bluetooth LE. Page: 2. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features**

**CPU and On-Chip Memory**
- ESP32-C5 embedded, 32-bit RISC-V single-core microprocessor, up to 240 MHz
- ROM: 320 KB
- HP SRAM: 384 KB
- LP SRAM: 16 KB
- PSRAM: Up to 8 MB (optional)

**Wi-Fi**
- 1T1R in 2.4 and 5 GHz dual band
- Operating frequency: 2412 ~ 2484 MHz, 5180 ~ 5885 MHz
- Data rate up to 150 Mbps
- IEEE 802.11ax-compliant
  - 20 MHz only
  - Uplink and downlink OFDMA to enhance connectivity and performance in congested environments for IoT applications
  - Downlink MU-MIMO (multi-user, multiple input, multiple output) to increase network capacity
  - Beamformee that improves signal quality
  - Spatial reuse to maximize parallel transmissions
  - Target wake time (TWT) that optimizes power saving mechanisms
- IEEE 802.11ac-compliant
  - 20 MHz bandwidth
  - Downlink fullband MU-MIMO
- Fully compatible with IEEE 802.11b/g/n protocol
  - 20 MHz and 40 MHz bandwidth
  - MCS0 ~ MCS7
  - Wi-Fi Multimedia (WMM)
  - TX/RX A-MPDU, TX/RX A-MSDU
  - Immediate Block ACK
  - Fragmentation and defragmentation
  - Transmit opportunity (TXOP)
  - Automatic Beacon monitoring (hardware TSF)
  - Four virtual Wi-Fi interfaces
  - Simultaneous support for Infrastructure BSS in Station mode, SoftAP mode, Station + SoftAP mode, and promiscuous mode. Note that when ESP32-C5 scans in Station mode, the SoftAP channel will change along with the Station channel
  - Antenna diversity
  - 802.11mc FTM

**Bluetooth**
- Bluetooth LE: Bluetooth Core 6.0 certified
- Bluetooth mesh 1.1
- High power mode (20 dBm)
- Direction finding (AoA/AoD)$t$),
 ('features-802154-peripherals-antenna','Features: 802.15.4, peripherals, antenna options, operating conditions','[3]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Features: 802.15.4, peripherals, antenna options, operating conditions. Page: 3. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1 Module Overview (continued): Bluetooth LE, IEEE 802.15.4, Peripherals, Integrated Components, Antenna Options, Operating Conditions**

- LE connection subrating
- LE power control
- Speed: 125 Kbps, 500 Kbps, 1 Mbps, 2 Mbps
- LE advertising extensions and multiple advertising sets
- Allow devices to operate in Broadcaster, Observer, Central, and Peripheral roles concurrently

**IEEE 802.15.4**
- Compliant with IEEE 802.15.4-2015 protocol
- OQPSK PHY in 2.4 GHz band
- Data rate: 250 Kbps
- Thread 1.4
- Zigbee 3.0

**Peripherals**
- GPIO, SPI, parallel IO interface, UART, I2C, I2S, RMT (TX/RX), pulse counter, LED PWM, USB Serial/JTAG controller, MCPWM, GDMA, CAN FD controller, SDIO slave controller, BitScrambler, event task matrix, ADC, temperature sensor, brownout detector, analog voltage comparator, system timer, general-purpose timers, RTC timer, watchdog timers, etc.

**Integrated Components on Module**
- 48 MHz crystal oscillator
- Up to 32 MB SPI flash (optional)
- Dual-band diplexer

**Antenna Options**
- ESP32-C5-WROOM-1: On-board PCB antenna
- ESP32-C5-WROOM-1U: External antenna via a connector or module pin (ANT2)

**Operating Conditions**
- Operating voltage/Power supply: 3.0 ~ 3.6 V
- Operating ambient temperature: −40 ~ 85 °C

**Certification**
- RF certification: See certificates
- Green certification: RoHS/REACH

**Test**
- HTOL/HTSL/uHAST/TCT/ESD

**1.2 Series Comparison**

ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U are two general-purpose 2.4 and 5 GHz dual-band Wi-Fi 6 (802.11ax), Bluetooth® 5 (LE), Zigbee, and Thread (802.15.4) modules. The rich set of peripherals and high performance make the module an ideal choice for smart homes, industrial automation, health care, consumer electronics, etc.

ESP32-C5-WROOM-1 comes with a PCB antenna. ESP32-C5-WROOM-1U comes with a connector or module pin (ANT2) for an external antenna.$t$),
 ('part-numbers-flash-psram-antenna','Part numbers: flash, PSRAM, antenna and size options','[4]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Part numbers: flash, PSRAM, antenna and size options. Page: 4. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 1-1. ESP32-C5-WROOM-1 (ANT) Series Comparison (note 1)**

| Part Number (note 2) | Flash (notes 3, 4) | PSRAM | Embedded Chip | Ambient Temp. (note 5) (°C) | Size (note 6) (mm) |
|---|---|---|---|---|---|
| ESP32-C5-WROOM-1-N4 | 4 MB (Quad SPI) | - | ESP32-C5HF4 | −40 ~ 85 | 18.0 × 27.5 × 3.3 |
| ESP32-C5-WROOM-1-N4R2 | 4 MB (Quad SPI) | 2 MB (Quad SPI) | ESP32-C5HR2 | −40 ~ 85 | 18.0 × 27.5 × 3.3 |
| ESP32-C5-WROOM-1-N8R2 | 8 MB (Quad SPI) | 2 MB (Quad SPI) | ESP32-C5HR2 | −40 ~ 85 | 18.0 × 27.5 × 3.3 |
| ESP32-C5-WROOM-1-N16R2 | 16 MB (Quad SPI) | 2 MB (Quad SPI) | ESP32-C5HR2 | −40 ~ 85 | 18.0 × 27.5 × 3.3 |
| ESP32-C5-WROOM-1-N8R8 | 8 MB (Quad SPI) | 8 MB (Quad SPI) | ESP32-C5HR8 | −40 ~ 85 | 18.0 × 27.5 × 3.3 |
| ESP32-C5-WROOM-1-N16R8 | 16 MB (Quad SPI) | 8 MB (Quad SPI) | ESP32-C5HR8 | −40 ~ 85 | 18.0 × 27.5 × 3.3 |
| ESP32-C5-WROOM-1-N32R8 | 32 MB (Quad SPI) | 8 MB (Quad SPI) | ESP32-C5HR8 | −40 ~ 85 | 18.0 × 27.5 × 3.3 |

(note 1) This table shares the notes 3-6 presented in Table 1-2 below.

**Table 1-2. ESP32-C5-WROOM-1U (CONN) Series Comparison (notes 7, 8)**

| Part Number (note 2) | Flash (notes 3, 4) | PSRAM | Embedded Chip | Ambient Temp. (note 5) (°C) | Size (note 6) (mm) |
|---|---|---|---|---|---|
| ESP32-C5-WROOM-1U-N4 | 4 MB (Quad SPI) | - | ESP32-C5HF4 | −40 ~ 85 | 18.0 × 21.2 × 3.3 |
| ESP32-C5-WROOM-1U-N16R2 | 16 MB (Quad SPI) | 2 MB (Quad SPI) | ESP32-C5HR2 | −40 ~ 85 | 18.0 × 21.2 × 3.3 |
| ESP32-C5-WROOM-1U-N8R8 | 8 MB (Quad SPI) | 8 MB (Quad SPI) | ESP32-C5HR8 | −40 ~ 85 | 18.0 × 21.2 × 3.3 |
| ESP32-C5-WROOM-1U-N16R8 | 16 MB (Quad SPI) | 8 MB (Quad SPI) | ESP32-C5HR8 | −40 ~ 85 | 18.0 × 21.2 × 3.3 |
| ESP32-C5-WROOM-1U-N32R8 | 32 MB (Quad SPI) | 8 MB (Quad SPI) | ESP32-C5HR8 | −40 ~ 85 | 18.0 × 21.2 × 3.3 |

(note 2) Variants with special flash, PSRAM sizes, or ambient temperatures are not listed individually. For customization requests, please contact us.
(note 3) For specifications, refer to Section 6.5 Memory Specifications.
(note 4) By default, the SPI flash on the module operates at a maximum clock frequency of 80 MHz and does not support the auto suspend feature. If you need the flash auto suspend feature, please contact us.
(note 5) Ambient temperature specifies the recommended temperature range of the environment immediately outside the Espressif module.
(note 6) For details, refer to Section 10.1 Module Dimensions.
(note 7) ESP32-C5-WROOM-1U uses ANT1 by default. To order a custom ANT2 model, append the suffix T2 to the general part number, for example: ESP32-C5-WROOM-1U-N8R8T2.$t$),
 ('pin-definitions-1','Pin definitions (part 1/2)','[13,14]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Pin definitions (part 1/2). Pages: 13, 14. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**3.2 Pin Description**

The module ESP32-C5-WROOM-1 has 29 pins, and module ESP32-C5-WROOM-1U has 32 pins. See pin definitions in Table 3-1 ESP32-C5-WROOM-1 Pin Definitions (note 1) and Table 3-2 ESP32-C5-WROOM-1U Pin Definitions.

For peripheral pin configurations, please refer to Section 5.2 Peripheral Description.

**Table 3-1. ESP32-C5-WROOM-1 Pin Definitions (note 1)**

| Name | No. | Type (note 2) | Function |
|---|---|---|---|
| GND | 1 | P | Ground |
| 3V3 | 2 | P | Power Supply |
| EN | 3 | I | High: on, enables the chip. Low: off, the chip powers off. Note: Do not leave the EN pin floating. |
| IO2 | 4 | I/O/T | MTMS, GPIO2, LP_GPIO2, LP_UART_RTSN, LP_I2C_SDA, ADC1_CH1, FSPIQ |
| IO3 | 5 | I/O/T | MTDI, GPIO3, LP_GPIO3, LP_UART_CTSN, LP_I2C_SCL, ADC1_CH2 |
| IO0 | 6 | I/O/T | GPIO0, XTAL_32K_P, LP_GPIO0, LP_UART_DTRN |
| IO1 | 7 | I/O/T | GPIO1, XTAL_32K_N, LP_GPIO1, LP_UART_DSRN, ADC1_CH0 |
| IO6 | 8 | I/O/T | GPIO6, LP_GPIO6, ADC1_CH5, FSPICLK |
| IO7 | 9 | I/O/T | GPIO7, FSPID, SDIO_DATA1 |
| IO8 | 10 | I/O/T | GPIO8, PAD_COMP0, SDIO_DATA0 |
| IO9 | 11 | I/O/T | GPIO9, PAD_COMP1, SDIO_CLK |
| IO10 | 12 | I/O/T | GPIO10, FSPICS0, SDIO_CMD |
| IO13 | 13 | I/O/T | GPIO13, USB_D-, SDIO_DATA3 |
| IO14 | 14 | I/O/T | GPIO14, USB_D+, SDIO_DATA2 |$t$),
 ('pin-definitions-2','Pin definitions (part 2/2)','[14,15]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Pin definitions (part 2/2). Pages: 14, 15. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3-1. ESP32-C5-WROOM-1 Pin Definitions (continued)**

| Name | No. | Type (note 2) | Function |
|---|---|---|---|
| IO28 | 15 | I/O/T | GPIO28 |
| IO5 | 16 | I/O/T | MTDO, GPIO5, LP_GPIO5, LP_UART_TXD, ADC1_CH4, FSPIWP |
| IO4 | 17 | I/O/T | MTCK, GPIO4, LP_GPIO4, LP_UART_RXD, ADC1_CH3, FSPIHD |
| IO27 | 18 | I/O/T | GPIO27 |
| NC/IO15 | 19 | I/O/T | SPICS1, GPIO15 (note 3) |
| NC | 20 | - | NC |
| IO23 | 21 | I/O/T | GPIO23 |
| NC | 22 | - | NC |
| IO24 | 23 | I/O/T | GPIO24 |
| RX0 | 24 | I/O/T | U0RXD, GPIO12 |
| TX0 | 25 | I/O/T | U0TXD, GPIO11 |
| IO25 | 26 | I/O/T | GPIO25 |
| IO26 | 27 | I/O/T | GPIO26 |
| GND | 28 | P | Ground |
| EPAD | 29 | P | Ground |

(note 1) This table shares the notes 2 and 3 presented in Table 3-2 below.

(note 2) P: power supply; I: input; O: output; T: high impedance.
(note 3) In modules with the in-package SPI PSRAM, this pin is used as SPICS1 for SPI PSRAM and cannot be used for other functions; in modules without the in-package SPI PSRAM, this pin can be used as GPIO15.$t$),
 ('pin-definitions-2--2','Pin definitions (part 2/2) (continued)','[14,15]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Pin definitions (part 2/2) (continued). Pages: 14, 15. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3-2. ESP32-C5-WROOM-1U Pin Definitions**

| Name | No. | Type (note 2) | Function |
|---|---|---|---|
| GND | 1 | P | Ground |
| 3V3 | 2 | P | Power Supply |
| EN | 3 | I | High: on, enables the chip. Low: off, the chip powers off. Note: Do not leave the EN pin floating. |
| IO2 | 4 | I/O/T | MTMS, GPIO2, LP_GPIO2, LP_UART_RTSN, LP_I2C_SDA, ADC1_CH1, FSPIQ |
| IO3 | 5 | I/O/T | MTDI, GPIO3, LP_GPIO3, LP_UART_CTSN, LP_I2C_SCL, ADC1_CH2 |
| IO0 | 6 | I/O/T | GPIO0, XTAL_32K_P, LP_GPIO0, LP_UART_DTRN |
| IO1 | 7 | I/O/T | GPIO1, XTAL_32K_N, LP_GPIO1, LP_UART_DSRN, ADC1_CH0 |
| IO6 | 8 | I/O/T | GPIO6, LP_GPIO6, ADC1_CH5, FSPICLK |
| IO7 | 9 | I/O/T | GPIO7, FSPID, SDIO_DATA1 |
| IO8 | 10 | I/O/T | GPIO8, PAD_COMP0, SDIO_DATA0 |
| IO9 | 11 | I/O/T | GPIO9, PAD_COMP1, SDIO_CLK |
| IO10 | 12 | I/O/T | GPIO10, FSPICS0, SDIO_CMD |
| IO13 | 13 | I/O/T | GPIO13, USB_D-, SDIO_DATA3 |
| IO14 | 14 | I/O/T | GPIO14, USB_D+, SDIO_DATA2 |$t$),
 ('pin-definitions-2--3','Pin definitions (part 2/2) (continued)','[14,15]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Pin definitions (part 2/2) (continued). Pages: 14, 15. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3-2. ESP32-C5-WROOM-1U Pin Definitions (continued)**

| Name | No. | Type (note 2) | Function |
|---|---|---|---|
| IO28 | 15 | I/O/T | GPIO28 |
| IO5 | 16 | I/O/T | MTDO, GPIO5, LP_GPIO5, LP_UART_TXD, ADC1_CH4, FSPIWP |
| IO4 | 17 | I/O/T | MTCK, GPIO4, LP_GPIO4, LP_UART_RXD, ADC1_CH3, FSPIHD |
| IO27 | 18 | I/O/T | GPIO27 |
| NC/IO15 | 19 | I/O/T | SPICS1, GPIO15 (note 3) |
| NC | 20 | - | NC |
| IO23 | 21 | I/O/T | GPIO23 |
| NC | 22 | - | NC |
| IO24 | 23 | I/O/T | GPIO24 |
| RX0 | 24 | I/O/T | U0RXD, GPIO12 |
| TX0 | 25 | I/O/T | U0TXD, GPIO11 |
| IO25 | 26 | I/O/T | GPIO25 |
| IO26 | 27 | I/O/T | GPIO26 |
| GND | 28 | P | Ground |
| EPAD | 29 | P | Ground |
| GND | 30 | P | Ground |
| ANT2 (note 4) | 31 | I/O | RF input and output |
| GND | 32 | P | Ground |

(note 2) P: power supply; I: input; O: output; T: high impedance.
(note 3) In modules with the in-package SPI PSRAM, this pin is used as SPICS1 for SPI PSRAM and cannot be used for other functions; in modules without the in-package SPI PSRAM, this pin can be used as GPIO15.
(note 4) By default, ESP32-C5-WROOM-1U uses ANT1, and ANT2 is disabled. To use ANT2, please contact us.$t$),
 ('strapping-pins','Strapping pins and default configuration','[16]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Strapping pins and default configuration. Page: 16. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Chapter 4 Boot Configurations: strapping pins**

The chip allows for configuring the following boot parameters through strapping pins and eFuse parameters at power-up or a hardware reset, without microcontroller interaction.

- Chip boot mode
  - Strapping pin: GPIO26, GPIO27, and GPIO28
- SDIO sampling and driving clock edge
  - Strapping pin: GPIO25 and MTDI
- ROM message printing
  - Strapping pin: GPIO27
  - eFuse parameter: EFUSE_UART_PRINT_CONTROL and EFUSE_DIS_USB_SERIAL_JTAG_ROM_PRINT
- JTAG signal source
  - Strapping pin: GPIO7
  - eFuse parameter: EFUSE_DIS_PAD_JTAG, EFUSE_DIS_USB_JTAG, and EFUSE_JTAG_SEL_ENABLE

The default values of all the above eFuse parameters are 0, which means that they are not burnt. Given that eFuse is one-time programmable, once programmed to 1, it can never be reverted to 0. For how to program eFuse parameters, please refer to ESP32-C5 Technical Reference Manual > Chapter eFuse Controller.

The default values of the strapping pins, namely the logic levels, are determined by pins' internal weak pull-up/pull-down resistors at reset if the pins are not connected to any circuit, or connected to an external high-impedance circuit.

**Table 4-1. Default Configuration of Strapping Pins**

| Strapping Pin | Default Configuration | Bit Value |
|---|---|---|
| GPIO25 | Floating | – |
| GPIO26 | Floating | – |
| GPIO27 | Pull-up | 1 |
| GPIO28 | Pull-up | 1 |
| GPIO7 | Floating | – |
| MTMS | Floating | – |
| MTDI | Floating | – |

To change the bit values, the strapping pins should be connected to external pull-down/pull-up resistances.$t$),
 ('boot-mode-download','Chip boot mode and download boot control','[18]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Chip boot mode and download boot control. Page: 18. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4.1 Chip Boot Mode Control**

GPIO26, GPIO27, and GPIO28 control the boot mode after the reset is released. See Table 4-3 Chip Boot Mode Control.

**Table 4-3. Chip Boot Mode Control**

| Boot Mode | GPIO26 | GPIO27 | GPIO28 |
|---|---|---|---|
| SPI boot mode (note 1) | Any value | Any value | 1 (note 1) |
| Joint download boot mode 0 (note 2) | Any value | 1 | 0 |
| Joint download boot mode 1 (note 3) | 0 | 0 | 0 |

(note 1) Bold marks the default value and configuration. (In the printed table, SPI boot mode and its GPIO28 value 1 are in bold, i.e. the default.)
(note 2) Joint Download Boot 0 mode supports the following download methods:
- USB-Serial-JTAG Download Boot
- UART Download Boot
- SPI Slave Download Boot (chip revision v0.1 only)

(note 3) Joint Download Boot 1 mode supports the following download methods:
- UART Download Boot
- SDIO Download Boot

In SPI Boot mode, the ROM bootloader loads and executes the program from SPI flash to boot the system.

In Joint Download Boot 0 mode, users can download binary files into flash using UART0, USB, or SPI Slave interfaces. It is also possible to download binary files into SRAM and execute them from SRAM.

In Joint Download Boot 1 mode, users can download binary files into flash using UART0 or SDIO interfaces. It is also possible to download binary files into SRAM and execute them from SRAM.$t$),
 ('ratings-operating-conditions','Absolute maximum ratings and recommended operating conditions','[32]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Absolute maximum ratings and recommended operating conditions. Page: 32. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.1 Absolute Maximum Ratings**

Stresses above those listed in Table 6-1 Absolute Maximum Ratings may cause permanent damage to the device. These are stress ratings only and functional operation of the device at these or any other conditions beyond those indicated under Table 6-2 Recommended Operating Conditions is not implied. Exposure to absolute-maximum-rated conditions for extended periods may affect device reliability.

**Table 6-1. Absolute Maximum Ratings**

| Symbol | Parameter | Min | Max | Unit |
|---|---|---|---|---|
| VDD33 | Power supply voltage | −0.3 | 3.6 | V |

**6.2 Recommended Operating Conditions**

**Table 6-2. Recommended Operating Conditions**

| Symbol | Parameter | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| VDD33 | Power supply voltage | 3.0 | 3.3 | 3.6 | V |
| IVDD | Current delivered by external power supply | 0.6 | — | — | A |
| TA | Operating ambient temperature | −40 | — | 85 | °C |$t$),
 ('dc-characteristics','DC characteristics (3.3 V, 25 C)','[32,33]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: DC characteristics (3.3 V, 25 C). Pages: 32, 33. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 6-3. DC Characteristics (3.3 V, 25 °C)**

| Parameter | Description | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| CIN | Pin capacitance | — | 2 | — | pF |
| VIH | High-level input voltage | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| VIL | Low-level input voltage | −0.3 | — | 0.25 × VDD (note 1) | V |
| IIH | High-level input current | — | — | 50 | nA |
| IIL | Low-level input current | — | — | 50 | nA |
| VOH (note 2) | High-level output voltage | 0.8 × VDD (note 1) | — | — | V |
| VOL (note 2) | Low-level output voltage | — | — | 0.1 × VDD (note 1) | V |
| IOH | High-level source current (VDD (note 1) = 3.3 V, VOH >= 2.64 V, PAD_DRIVER = 3) | — | 40 | — | mA |
| IOL | Low-level sink current (VDD (note 1) = 3.3 V, VOL = 0.495 V, PAD_DRIVER = 3) | — | 28 | — | mA |
| RPU | Internal weak pull-up resistor | — | 45 | — | kΩ |
| RPD | Internal weak pull-down resistor | — | 45 | — | kΩ |
| VIH_nRST | Chip reset release voltage (CHIP_PU voltage is within the specified range) | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| VIL_nRST | Chip reset voltage (CHIP_PU voltage is within the specified range) | −0.3 | — | 0.25 × VDD (note 1) | V |

(note 1) VDD – voltage from a power pin of a respective power domain.
(note 2) VOH and VOL are measured using high-impedance load.$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xC5 ESP32-C5 Development Board','Espressif ESP32-C5-WROOM-1 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxc5-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='7d3c3265-756c-4462-a062-5528218798a2' AND artifact_key='3c93a309b9611d0b200372a8d0d6a5402450c52a3c75c8dcc429bf80a067488d';
 FOR r IN SELECT * FROM (VALUES
 ('current-wifi-active','Current consumption: Wi-Fi active mode','[33]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Current consumption: Wi-Fi active mode. Page: 33. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4.1 Current Consumption in Active Mode**

The current consumption measurements are taken with a 3.3 V supply at 25 °C ambient temperature.

TX current consumption is rated at a 100% duty cycle.

RX current consumption is rated when the peripherals are disabled and the CPU idle.

**Table 6-4. Current Consumption for Wi-Fi (2.4 GHz) in Active Mode**

| Work Mode | RF Condition | Description | Peak (mA) |
|---|---|---|---|
| Active (RF working) | TX | 802.11b, 1 Mbps, DSSS @ 19 dBm | 313 |
| Active (RF working) | TX | 802.11g, 54 Mbps, OFDM @ 16 dBm | 257 |
| Active (RF working) | TX | 802.11n, HT20, MCS7 @ 16 dBm | 258 |
| Active (RF working) | TX | 802.11n, HT40, MCS7 @ 15 dBm | 252 |
| Active (RF working) | TX | 802.11ax, MCS9 @ 14 dBm | 238 |
| Active (RF working) | RX | 802.11b/g/n, HT20 | 87 |
| Active (RF working) | RX | 802.11n, HT40 | 91 |
| Active (RF working) | RX | 802.11ax, HE20 | 87 |

**Table 6-5. Current Consumption for Wi-Fi (5 GHz) in Active Mode**

| Work Mode | RF Condition | Description | Peak (mA) |
|---|---|---|---|
| Active (RF working) | TX | 802.11a, 6 Mbps, OFDM @ 16.5 dBm | 403 |
| Active (RF working) | TX | 802.11n, HT20, MCS7 @ 14.5 dBm | 383 |
| Active (RF working) | TX | 802.11n, HT40, MCS7 @ 13.5 dBm | 377 |
| Active (RF working) | TX | 802.11ac, VHT20, MCS7 @ 14.5 dBm | 381 |
| Active (RF working) | TX | 802.11ax, HE20, MCS7 @ 14.5 dBm | 382 |
| Active (RF working) | RX | 802.11a/n, HT20 | 110 |
| Active (RF working) | RX | 802.11n, HT40 | 113 |
| Active (RF working) | RX | 802.11ac, VHT20 | 110 |
| Active (RF working) | RX | 802.11ax, HE20 | 110 |$t$),
 ('current-ble-154-sleep','Current consumption: Bluetooth LE, 802.15.4 and low-power modes','[34,35]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Current consumption: Bluetooth LE, 802.15.4 and low-power modes. Pages: 34, 35. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 6-6. Current Consumption for Bluetooth LE in Active Mode**

| Work Mode | RF Condition | Description | Peak (mA) |
|---|---|---|---|
| Active (RF working) | TX | Bluetooth LE @ 19 dBm | 319 |
| Active (RF working) | TX | Bluetooth LE @ 8 dBm | 175 |
| Active (RF working) | TX | Bluetooth LE @ −1 dBm | 134 |
| Active (RF working) | TX | Bluetooth LE @ −16 dBm | 90 |
| Active (RF working) | RX | Bluetooth LE | 79 |

**Table 6-7. Current Consumption for 802.15.4 in Active Mode**

| Work Mode | RF Condition | Description | Peak (mA) |
|---|---|---|---|
| Active (RF working) | TX | 802.15.4 @ 19 dBm | 321 |
| Active (RF working) | TX | 802.15.4 @ 8 dBm | 176 |
| Active (RF working) | TX | 802.15.4 @ −1 dBm | 134 |
| Active (RF working) | TX | 802.15.4 @ −16 dBm | 89 |
| Active (RF working) | RX | 802.15.4 | 78 |

**Table 6-9. Current Consumption in Low-Power Modes**

| Mode | Description | Typ (mA) |
|---|---|---|
| Light-sleep | CPU and wireless communication modules are powered down, peripheral clocks are disabled, and all GPIOs are high-impedance | 0.25 |
| Light-sleep | CPU, wireless communication modules and peripherals are powered down, and all GPIOs are high-impedance | 0.06 |
| Deep-sleep | RTC timer and LP memory are powered on | 0.012 |
| Power off | CHIP_PU is set to low level, the chip is powered off | 0.002 |$t$),
 ('rf-wifi-tx-power','Wi-Fi TX power, 2.4 GHz and 5 GHz','[36,39]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Wi-Fi TX power, 2.4 GHz and 5 GHz. Pages: 36, 39. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 7-2. 2.4 GHz TX Power with Spectral Mask and EVM Meeting 802.11 Standards**

| Rate | Min (dBm) | Typ (dBm) | Max (dBm) |
|---|---|---|---|
| 802.11b, 1 Mbps, DSSS | — | 19.0 | — |
| 802.11b, 11 Mbps, CCK | — | 19.0 | — |
| 802.11g, 6 Mbps, OFDM | — | 18.0 | — |
| 802.11g, 54 Mbps, OFDM | — | 16.0 | — |
| 802.11n, HT20, MCS0 | — | 18.0 | — |
| 802.11n, HT20, MCS7 | — | 16.0 | — |
| 802.11n, HT40, MCS0 | — | 17.0 | — |
| 802.11n, HT40, MCS7 | — | 15.0 | — |
| 802.11ax, HE20, MCS0 | — | 18.0 | — |
| 802.11ax, HE20, MCS9 | — | 14.0 | — |

**7.2 5 GHz Wi-Fi Radio**

**Table 7-7. 5 GHz Wi-Fi RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 5180 ~ 5885 MHz |
| Wi-Fi wireless standard | IEEE 802.11a/n/ac/ax |

**7.2.1 5 GHz Wi-Fi RF Transmitter (TX) Characteristics**

**Table 7-8. 5 GHz TX Power with Spectral Mask and EVM Meeting 802.11 Standards**

| Rate | Min (dBm) | Typ (dBm) | Max (dBm) |
|---|---|---|---|
| 802.11a, 6 Mbps, OFDM | — | 16.5 | — |
| 802.11a, 54 Mbps, OFDM | — | 15.5 | — |
| 802.11n, HT20, MCS0 | — | 16.5 | — |
| 802.11n, HT20, MCS7 | — | 14.5 | — |
| 802.11n, HT40, MCS0 | — | 15.5 | — |
| 802.11n, HT40, MCS7 | — | 13.5 | — |
| 802.11ac, VHT20, MCS0 | — | 16.5 | — |
| 802.11ac, VHT20, MCS7 | — | 14.5 | — |
| 802.11ax, HE20, MCS0 | — | 16.5 | — |
| 802.11ax, HE20, MCS7 | — | 14.5 | — |$t$),
 ('rf-wifi-rx-sensitivity','2.4 GHz Wi-Fi RX sensitivity (continued table, HT40 MCS2-7 and HE20)','[38]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: 2.4 GHz Wi-Fi RX sensitivity (continued table, HT40 MCS2-7 and HE20). Page: 38. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 7-4 (continued from previous page; rows as printed on this page)**

| Rate | Min (dBm) | Typ (dBm) | Max (dBm) |
|---|---|---|---|
| 802.11n, HT40, MCS2 | — | −85.5 | — |
| 802.11n, HT40, MCS3 | — | −82.5 | — |
| 802.11n, HT40, MCS4 | — | −79.0 | — |
| 802.11n, HT40, MCS5 | — | −75.5 | — |
| 802.11n, HT40, MCS6 | — | −73.5 | — |
| 802.11n, HT40, MCS7 | — | −72.5 | — |
| 802.11ax, HE20, MCS0 | — | −93.0 | — |
| 802.11ax, HE20, MCS1 | — | −90.0 | — |
| 802.11ax, HE20, MCS2 | — | −87.5 | — |
| 802.11ax, HE20, MCS3 | — | −85.0 | — |
| 802.11ax, HE20, MCS4 | — | −81.5 | — |
| 802.11ax, HE20, MCS5 | — | −77.5 | — |
| 802.11ax, HE20, MCS6 | — | −76.0 | — |
| 802.11ax, HE20, MCS7 | — | −75.0 | — |
| 802.11ax, HE20, MCS8 | — | −70.0 | — |
| 802.11ax, HE20, MCS9 | — | −69.0 | — |$t$),
 ('rf-ble-802154','Bluetooth LE and 802.15.4 radio','[42,46]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C5-WROOM-1 and ESP32-C5-WROOM-1U Datasheet, v1.3, 2026-09-03. Section: Bluetooth LE and 802.15.4 radio. Pages: 42, 46. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7.3 Bluetooth 5 (LE) Radio**

**Table 7-13. Bluetooth LE RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2402 ~ 2480 MHz |
| RF transmit power range | −15 ~ 20 dBm |

**7.4.1 802.15.4 RF Transmitter (TX) Characteristics**

**Table 7-23. 802.15.4 Transmitter Characteristics - 250 Kbps**

| Parameter | Min | Typ | Max | Unit |
|---|---|---|---|---|
| RF transmit power range | −15.0 | — | 20.0 | dBm |
| EVM | — | 4.0% | — | — |

**7.4.2 802.15.4 RF Receiver (RX) Characteristics**

**Table 7-24. 802.15.4 Receiver Characteristics - 250 Kbps**

| Parameter | Description | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| Sensitivity @1% PER | — | — | −103.0 | — | dBm |
| Maximum received signal @1% PER | — | — | 5 | — | dBm |
| Relative jamming level, Adjacent channel | F = F0 + 5 MHz | — | 28 | — | dB |
| Relative jamming level, Adjacent channel | F = F0 − 5 MHz | — | 32 | — | dB |
| Relative jamming level, Alternate channel | F = F0 + 10 MHz | — | 48 | — | dB |
| Relative jamming level, Alternate channel | F = F0 − 10 MHz | — | 53 | — | dB |$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xC5 ESP32-C5 Development Board','Espressif ESP32-C5-WROOM-1 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxc5-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE v public.panda_agent_versions; n bigint; d text;
BEGIN
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE source_id='7d3c3265-756c-4462-a062-5528218798a2' AND artifact_key='3c93a309b9611d0b200372a8d0d6a5402450c52a3c75c8dcc429bf80a067488d';
 IF v.state='approved' THEN RETURN; END IF;
 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(logical_chunk_id||':'||text_hash||':'||locator,E'\n' ORDER BY logical_chunk_id),''),'UTF8')),'hex') INTO n,d FROM public.panda_agent_chunks WHERE document_version_id=v.id;
 IF n<>16 THEN RAISE EXCEPTION 'ESPXC5: % chunks, expected 16',n; END IF;
 PERFORM public.panda_agent_seal_version(v.id,v.version,n::int,d);
 PERFORM public.panda_agent_review_version(v.id,v.version+1,'approve','Owner requested Espressif datasheet excerpts on 2026-11-13; tables number-checked against the PDF text layer');
END $m$;
-- @@split
DO $m$ BEGIN
 PERFORM public.panda_agent_store_version('ec4f4c5b-ac7e-4960-bca0-8d28ecd7eca6','623b8dfe-5241-4551-9917-836c567740c3','833b6026-d946-4379-a070-a07ca17f3cbc',NULL,'29d709ea008f05f0af3847b325fff860b4b2d2618e9c24df0df981fcc84dd4a5','163020762fa6d499e0c611c5a13e78ad9d4720b421c6bc5e14e16fc748862b73',938372,$t${"document":"ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet","version":"Datasheet Version 1.4","source_url":"https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf","pdf_sha256":"163020762fa6d499e0c611c5a13e78ad9d4720b421c6bc5e14e16fc748862b73","excerpts":[{"key":"module-overview","sha256":"1e4d7dae4ea395ee348a6d74d522c46bcfb89f4d9114b02c36b8091fe4d67656"},{"key":"features-1","sha256":"9411419e3b63193ac78e65426abdea2dd463bbe74b6e2dbe2c5f09df60f1e1e8"},{"key":"features-2","sha256":"45fcf2892c4a758b459b56c55260d414a541075bd793c0d04a27ee5a5bb55e50"},{"key":"features-802154-peripherals","sha256":"7b4ea7243b3eaaa2acaab74cab157a40ac34846c8c9bc125b777db32f779e5c5"},{"key":"variants-flash-antenna","sha256":"565a3d9a457528ce2edc45fba512b18cc0f3a37ed229993d5881d80e43de89e9"},{"key":"pin-layout","sha256":"8a2fae136b796415e3ceadc27ffef0e2bcbd532c7b5239da48ac138b7bccdd90"},{"key":"pin-definitions","sha256":"e7718dfa91408a6ec3a80f0ad0bc32cbb9373bbf7cd80b4cba7fd631a045c19e"},{"key":"strapping-pins","sha256":"3c973d8d5a6afd20bed389c82e46f790a5592a3aa4ab9627c5748b1e34e1f786"},{"key":"boot-mode","sha256":"ed6b383307e0af2cdf8f6e41ca63b91354a1997a4ffc3cb4a45d27867ae810eb"},{"key":"jtag-source","sha256":"0cae699e00193132a156c2609cdfd31cb6f23579ae98cf835980da5f686621a3"},{"key":"absolute-recommended","sha256":"670f755c1381773fe680fe940440e44f3e6c926d04381e9e5e3a0c983130e49f"},{"key":"dc-characteristics","sha256":"35aed493f711a4a49e83c812ad9b1aa739f6cd7716a8c502a806c5953a371398"},{"key":"current-active-wifi","sha256":"7404d1b5dd28c73b8136eb67822b0adb656aaf6c27b1815981c880ce2bdfe267"},{"key":"current-active-ble-154","sha256":"a4756904cd6e4e95c505407d273d1e9bf640a8508f72c6e77907d4b8f57a09c9"},{"key":"current-sleep","sha256":"cf33b18e56b8a2656af9b537011c202ac4517dd84e4aa04cfcd843be17af200a"},{"key":"wifi-tx","sha256":"ed7837c98305fca11b532e6a5518adbcbe7e1834fccb67b9a6149d283842b12f"},{"key":"ble-802154-rf","sha256":"d14e68b6c3fe025c422919e87f3229fc1d7f4a127a6b4256be7f49050502c816"},{"key":"uart-spi","sha256":"9cf1be0c16b776b2266b818087a0319a695bd2899ea8f5c338845d006bac0957"}]}$t$,'e2737157654954b6435bd9a03b896844e59ec156c683bb1cac2edd5046adbdc4','espressif-datasheet-excerpts-v1','386403f66ddfed7a20e2d02758e9bff83e6fd757cb34a89c208a52f03212b384','technical',NULL,'{"captured_at":"2026-11-13T00:00:00+00:00","rights":"vendor_datasheet_short_cited_excerpts_only","copyright_holder":"Espressif Systems","original_url":"https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf","document":"ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet","document_version":"Datasheet Version 1.4","method":"excerpts selected from the PDF text layer; tables transcribed from rendered pages and number-checked; owner requested 2026-11-13"}'::jsonb);
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='ec4f4c5b-ac7e-4960-bca0-8d28ecd7eca6' AND artifact_key='29d709ea008f05f0af3847b325fff860b4b2d2618e9c24df0df981fcc84dd4a5';
 FOR r IN SELECT * FROM (VALUES
 ('module-overview','Module overview and headline features','[1]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Module overview and headline features. Page: 1. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**ESP32-C6-WROOM-1 / ESP32-C6-WROOM-1U Datasheet, Version 1.4 (cover page)**

- Module that supports 2.4 GHz Wi-Fi 6 (802.11ax), Bluetooth 5 (LE), Zigbee and Thread (802.15.4)
- Built around ESP32-C6 series of SoCs, 32-bit RISC-V single-core microprocessor
- Flash up to 8 MB
- 23 GPIOs, rich set of peripherals
- On-board PCB antenna or external antenna connector$t$),
 ('features-1','Features: CPU, memory and Wi-Fi (part 1/2)','[2]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Features: CPU, memory and Wi-Fi (part 1/2). Page: 2. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features: CPU and On-Chip Memory, Wi-Fi**

CPU and On-Chip Memory
- ESP32-C6 embedded, 32-bit RISC-V single-core microprocessor, up to 160 MHz
- ROM: 320 KB
- HP SRAM: 512 KB
- LP SRAM: 16 KB

Wi-Fi
- 1T1R in 2.4 GHz band
- Operating frequency: 2412 ~ 2484 MHz
- IEEE 802.11ax-compliant
  - 20 MHz-only non-AP mode
  - MCS0 ~ MCS9
  - Uplink and downlink OFDMA, especially suitable for simultaneous connections in high-density environments
  - Downlink MU-MIMO (multi-user, multiple input, multiple output) to increase network capacity
- Fully compatible with IEEE 802.11b/g/n protocol (its sub-items are in the right column of the page)
  - 20 MHz and 40 MHz bandwidth
  - Data rate up to 150 Mbps
  - Wi-Fi Multimedia (WMM)
  - TX/RX A-MPDU, TX/RX A-MSDU
  - Immediate Block ACK
  - Fragmentation and defragmentation
  - Transmit opportunity (TXOP)
  - Automatic Beacon monitoring (hardware TSF)
  - 4 × virtual Wi-Fi interfaces
  - Simultaneous support for Infrastructure BSS in Station mode, SoftAP mode, Station + SoftAP mode, and promiscuous mode. *Note that when ESP32-C6 scans in Station mode, the SoftAP channel will change along with the Station channel*
  - 802.11mc FTM$t$),
 ('features-2','Features: Wi-Fi 6 and Bluetooth LE (part 2/2)','[2]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Features: Wi-Fi 6 and Bluetooth LE (part 2/2). Page: 2. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features: Wi-Fi 6 (continued) and Bluetooth**

Wi-Fi (continued, left column)
- Beamformee that improves signal quality
- Channel quality indication (CQI)
- DCM (dual carrier modulation) to improve link robustness
- Spatial reuse to maximize parallel transmissions
- Target wake time (TWT) that optimizes power saving mechanisms
- Fully compatible with IEEE 802.11b/g/n protocol

Bluetooth
- Bluetooth LE: Bluetooth 5.3 certified
- Bluetooth mesh
- High power mode (20 dBm)
- Speed: 125 Kbps, 500 Kbps, 1 Mbps, 2 Mbps
- Advertising extensions
- Multiple advertisement sets
- Channel selection algorithm #2
- LE power control$t$),
 ('features-802154-peripherals','Features: 802.15.4, peripherals, antenna and operating conditions','[3]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Features: 802.15.4, peripherals, antenna and operating conditions. Page: 3. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features: Co-existence, IEEE 802.15.4, Peripherals, Integrated Components, Antenna, Operating Conditions, Certification, Test**

- Internal co-existence mechanism between Wi-Fi and Bluetooth to share the same antenna

IEEE 802.15.4
- Compliant with IEEE 802.15.4-2015 protocol
- OQPSK PHY in 2.4 GHz band
- Data rate: 250 Kbps
- Thread 1.3
- Zigbee 3.0

Peripherals
- GPIO, SPI, parallel IO interface, UART, I2C, I2S, RMT (TX/RX), pulse counter, LED PWM, USB Serial/JTAG controller, MCPWM, SDIO slave controller, GDMA, TWAI controller, on-chip debug functionality via JTAG, event task matrix, ADC, temperature sensor, system timer, general-purpose timers, and watchdog timers

Integrated Components on Module
- 40 MHz crystal oscillator
- SPI flash

Antenna Options
- On-board PCB antenna (ESP32-C6-WROOM-1)
- External antenna via a connector (ESP32-C6-WROOM-1U)

Operating Conditions
- Operating voltage/Power supply: 3.0 ~ 3.6 V
- Operating ambient temperature: −40 ~ 85 °C

Certification
- RF certification: See certificates
- Green certification: RoHS/REACH

Test
- HTOL/HTSL/uHAST/TCT/ESD$t$),
 ('variants-flash-antenna','Series comparison: variants, flash and antenna options','[3]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Series comparison: variants, flash and antenna options. Page: 3. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.2 Series Comparison**

ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U are two powerful, general-purpose Wi-Fi, IEEE 802.15.4, and Bluetooth LE modules. The rich set of peripherals and high performance make the module an ideal choice for smart homes, industrial automation, health care, consumer electronics, etc.

ESP32-C6-WROOM-1 comes with a PCB antenna. ESP32-C6-WROOM-1U comes with a connector for an external antenna. They both feature an external SPI flash up to 8 MB.

Both ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U come in two versions:
- 4 MB flash version
- 8 MB flash version

The two versions only vary in flash part number. In this datasheet unless otherwise stated, ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U refer to the variants in 4 MB and 8 MB flash versions.$t$),
 ('pin-layout','Pin layout (top view)','[10]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Pin layout (top view). Page: 10. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Figure 3-1. Pin Layout (Top View)**

The pin diagram shows the approximate location of pins on the module. The pin diagram is applicable for ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U, but the latter has no keepout zone. The module has 29 pins. Pin numbers and labels as drawn (left side top to bottom 1-14, right side bottom to top 15-28; a Keepout Zone is drawn above the pins; pin 29 is the central GND pad):

| No. | Label |
| --- | --- |
| 1 | GND |
| 2 | 3V3 |
| 3 | EN |
| 4 | IO4 |
| 5 | IO5 |
| 6 | IO6 |
| 7 | IO7 |
| 8 | IO0 |
| 9 | IO1 |
| 10 | IO8 |
| 11 | IO10 |
| 12 | IO11 |
| 13 | IO12 |
| 14 | IO13 |
| 15 | IO9 |
| 16 | IO18 |
| 17 | IO19 |
| 18 | IO20 |
| 19 | IO21 |
| 20 | IO22 |
| 21 | IO23 |
| 22 | NC |
| 23 | IO15 |
| 24 | RXD0 |
| 25 | TXD0 |
| 26 | IO3 |
| 27 | IO2 |
| 28 | GND |
| 29 | GND |$t$),
 ('pin-definitions','Pin definitions (Table 3-1)','[11]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Pin definitions (Table 3-1). Page: 11. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3-1. Pin Definitions**

| Name | No. | Type (note 1) | Function |
| --- | --- | --- | --- |
| GND | 1 | P | Ground |
| 3V3 | 2 | P | Power supply |
| EN | 3 | I | High: on, enables the chip. Low: off, the chip powers off. Note: Do not leave the EN pin floating. |
| IO4 | 4 | I/O/T | MTMS, GPIO4, LP_GPIO4, LP_UART_RXD, ADC1_CH4, FSPIHD |
| IO5 | 5 | I/O/T | MTDI, GPIO5, LP_GPIO5, LP_UART_TXD, ADC1_CH5, FSPIWP |
| IO6 | 6 | I/O/T | MTCK, GPIO6, LP_GPIO6, LP_I2C_SDA, ADC1_CH6, FSPICLK |
| IO7 | 7 | I/O/T | MTDO, GPIO7, LP_GPIO7, LP_I2C_SCL, FSPID |
| IO0 | 8 | I/O/T | GPIO0, XTAL_32K_P, LP_GPIO0, LP_UART_DTRN, ADC1_CH0 |
| IO1 | 9 | I/O/T | GPIO1, XTAL_32K_N, LP_GPIO1, LP_UART_DSRN, ADC1_CH1 |
| IO8 | 10 | I/O/T | GPIO8 |
| IO10 | 11 | I/O/T | GPIO10 |
| IO11 | 12 | I/O/T | GPIO11 |
| IO12 | 13 | I/O/T | GPIO12, USB_D- |
| IO13 | 14 | I/O/T | GPIO13, USB_D+ |
| IO9 | 15 | I/O/T | GPIO9 |
| IO18 | 16 | I/O/T | GPIO18, SDIO_CMD, FSPICS2 |
| IO19 | 17 | I/O/T | GPIO19, SDIO_CLK, FSPICS3 |
| IO20 | 18 | I/O/T | GPIO20, SDIO_DATA0, FSPICS4 |
| IO21 | 19 | I/O/T | GPIO21, SDIO_DATA1, FSPICS5 |
| IO22 | 20 | I/O/T | GPIO22, SDIO_DATA2 |
| IO23 | 21 | I/O/T | GPIO23, SDIO_DATA3 |
| NC | 22 | — | NC |
| IO15 | 23 | I/O/T | GPIO15 |
| RXD0 | 24 | I/O/T | U0RXD, GPIO17, FSPICS1 |
| TXD0 | 25 | I/O/T | U0TXD, GPIO16, FSPICS0 |
| IO3 | 26 | I/O/T | GPIO3, LP_GPIO3, LP_UART_CTSN, ADC1_CH3 |
| IO2 | 27 | I/O/T | GPIO2, LP_GPIO2, LP_UART_RTSN, ADC1_CH2, FSPIQ |
| GND | 28 | P | Ground |
| EPAD | 29 | P | Ground |

(note 1) P: power supply; I: input; O: output; T: high impedance.$t$),
 ('strapping-pins','Strapping pins and defaults','[12]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Strapping pins and defaults. Page: 12. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4 Boot Configurations: strapping pins and Table 4-1. Default Configuration of Strapping Pins**

The chip allows for configuring the following boot parameters through strapping pins and eFuse parameters at power-up or a hardware reset, without microcontroller interaction.
- Chip boot mode
  - Strapping pin: GPIO8 and GPIO9
- SDIO Sampling and Driving Clock Edge
  - Strapping pin: MTMS and MTDI
- ROM message printing
  - Strapping pin: GPIO8
  - eFuse parameter: EFUSE_UART_PRINT_CONTROL and EFUSE_DIS_USB_SERIAL_JTAG_ROM_PRINT
- JTAG signal source
  - Strapping pin: GPIO15
  - eFuse parameter: EFUSE_DIS_PAD_JTAG, EFUSE_DIS_USB_JTAG, and EFUSE_JTAG_SEL_ENABLE

The default values of all the above eFuse parameters are 0, which means that they are not burnt. Given that eFuse is one-time programmable, once programmed to 1, it can never be reverted to 0. For how to program eFuse parameters, please refer to ESP32-C6 Technical Reference Manual > Chapter eFuse Controller.

The default values of the strapping pins, namely the logic levels, are determined by pins' internal weak pull-up/pull-down resistors at reset if the pins are not connected to any circuit, or connected to an external high-impedance circuit.

| Strapping Pin | Default Configuration | Bit Value |
| --- | --- | --- |
| MTMS | Floating | – |
| MTDI | Floating | – |
| GPIO8 | Floating | – |
| GPIO9 | Weak pull-up | 1 |
| GPIO15 | Floating | – |

To change the bit values, the strapping pins should be connected to external pull-down/pull-up resistances. If the ESP32-C6 is used as a device by a host MCU, the strapping pin voltage levels can also be controlled by the host MCU.$t$),
 ('boot-mode','Chip boot mode and download mode','[13]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Chip boot mode and download mode. Page: 13. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4.1 Chip Boot Mode Control. Table 4-3. Chip Boot Mode Control**

GPIO8 and GPIO9 control the boot mode after the reset is released. See Table 4-3 Chip Boot Mode Control.

| Boot Mode | GPIO8 | GPIO9 |
| --- | --- | --- |
| **SPI boot mode** (note 1) | Any value | **1** |
| Joint download boot mode (note 2) | 1 | 0 |

(note 1) Bold marks the default value and configuration.
(note 2) Joint Download Boot mode supports the following download methods:
- USB-Serial-JTAG Download Boot
- UART Download Boot
- SDIO Download Boot$t$),
 ('jtag-source','JTAG signal source control (GPIO15)','[15]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: JTAG signal source control (GPIO15). Page: 15. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4.4 JTAG Signal Source Control. Table 4-7. JTAG Signal Source Control**

The strapping pin GPIO15 can be used to control the source of JTAG signals during the early boot process. This pin does not have any internal pull resistors and the strapping value must be controlled by the external circuit that cannot be in a high impedance state.

As Table 4-7 JTAG Signal Source Control shows, GPIO15 is used in combination with EFUSE_DIS_PAD_JTAG, EFUSE_DIS_USB_JTAG and EFUSE_JTAG_SEL_ENABLE.

| JTAG Signal Source | EFUSE_DIS_PAD_JTAG | EFUSE_DIS_USB_JTAG | EFUSE_JTAG_SEL_ENABLE | GPIO15 |
| --- | --- | --- | --- | --- |
| USB Serial/JTAG Controller | **0** | **0** | **0** | Ignored |
| USB Serial/JTAG Controller | 0 | 0 | 1 | 1 |
| USB Serial/JTAG Controller | 1 | 0 | Ignored | Ignored |
| JTAG pins (note 2) | 0 | 0 | 1 | 0 |
| JTAG pins (note 2) | 0 | 1 | Ignored | Ignored |
| JTAG is disabled | 1 | 1 | Ignored | Ignored |

(note 1) Bold marks the default value and configuration.
(note 2) JTAG pins refer to MTDI, MTCK, MTMS, and MTDO.$t$),
 ('absolute-recommended','Absolute maximum ratings and recommended operating conditions','[26]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Absolute maximum ratings and recommended operating conditions. Page: 26. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.1 Absolute Maximum Ratings (Table 6-1) and 6.2 Recommended Operating Conditions (Table 6-2)**

Stresses above those listed in Table 6-1 Absolute Maximum Ratings may cause permanent damage to the device. These are stress ratings only and functional operation of the device at these or any other conditions beyond those indicated under Table 6-2 Recommended Operating Conditions is not implied. Exposure to absolute-maximum-rated conditions for extended periods may affect device reliability.

**Table 6-1. Absolute Maximum Ratings**

| Symbol | Parameter | Min | Max | Unit |
| --- | --- | --- | --- | --- |
| VDD33 | Power supply voltage | −0.3 | 3.6 | V |
| TSTORE | Storage temperature | −40 | 105 | °C |

**Table 6-2. Recommended Operating Conditions**

| Symbol | Parameter | Min | Typ | Max | Unit |
| --- | --- | --- | --- | --- | --- |
| VDD33 | Power supply voltage | 3.0 | 3.3 | 3.6 | V |
| IVDD | Current delivered by external power supply | 0.5 | — | — | A |
| TA | Operating ambient temperature, 85 °C version | −40 | — | 85 | °C |
| TA | Operating ambient temperature, 105 °C version | −40 | — | 105 | °C |$t$),
 ('dc-characteristics','DC characteristics (3.3 V, 25 C)','[26,27]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: DC characteristics (3.3 V, 25 C). Pages: 26, 27. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 6-3. DC Characteristics (3.3 V, 25 °C)**

| Parameter | Description | Min | Typ | Max | Unit |
| --- | --- | --- | --- | --- | --- |
| CIN | Pin capacitance | — | 2 | — | pF |
| VIH | High-level input voltage | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| VIL | Low-level input voltage | −0.3 | — | 0.25 × VDD (note 1) | V |
| IIH | High-level input current | — | — | 50 | nA |
| IIL | Low-level input current | — | — | 50 | nA |
| VOH (note 2) | High-level output voltage | 0.8 × VDD (note 1) | — | — | V |
| VOL (note 2) | Low-level output voltage | — | — | 0.1 × VDD (note 1) | V |
| IOH | High-level source current (VDD (note 1) = 3.3 V, VOH >= 2.64 V, PAD_DRIVER = 3) | — | 40 | — | mA |
| IOL | Low-level sink current (VDD (note 1) = 3.3 V, VOL = 0.495 V, PAD_DRIVER = 3) | — | 28 | — | mA |
| RPU | Internal weak pull-up resistor | — | 45 | — | kΩ |
| RPD | Internal weak pull-down resistor | — | 45 | — | kΩ |
| VIH_nRST | Chip reset release voltage (CHIP_PU voltage is within the specified range) | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| VIL_nRST | Chip reset voltage (CHIP_PU voltage is within the specified range) | −0.3 | — | 0.25 × VDD (note 1) | V |

(note 1) VDD – voltage from a power pin of a respective power domain.
(note 2) VOH and VOL are measured using high-impedance load.$t$),
 ('current-active-wifi','Current consumption in active mode: Wi-Fi','[27]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Current consumption in active mode: Wi-Fi. Page: 27. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4.1 Current Consumption in Active Mode. Table 6-4. Current Consumption for Wi-Fi (2.4 GHz) in Active Mode**

The current consumption measurements are taken with a 3.3 V supply at 25 °C ambient temperature.
TX current consumption is rated at a 100% duty cycle.
RX current consumption is rated when the peripherals are disabled and the CPU idle.

| Work Mode | RF Condition | Description | Peak (mA) |
| --- | --- | --- | --- |
| Active (RF working) | TX | 802.11b, 1 Mbps, DSSS @ 20.5 dBm | 382 |
| Active (RF working) | TX | 802.11g, 54 Mbps, OFDM @ 19.0 dBm | 316 |
| Active (RF working) | TX | 802.11n, HT20, MCS7 @ 18.0 dBm | 295 |
| Active (RF working) | TX | 802.11n, HT40, MCS7 @ 17.5 dBm | 280 |
| Active (RF working) | TX | 802.11ax, MCS9 @ 15.5 dBm | 251 |
| Active (RF working) | RX | 802.11b/g/n, HT20 | 78 |
| Active (RF working) | RX | 802.11n, HT40 | 82 |
| Active (RF working) | RX | 802.11ax, HE20 | 78 |$t$),
 ('current-active-ble-154','Current consumption in active mode: Bluetooth LE and 802.15.4','[27]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Current consumption in active mode: Bluetooth LE and 802.15.4. Page: 27. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 6-5. Current Consumption for Bluetooth LE in Active Mode**

| Work Mode | RF Condition | Description | Peak (mA) |
| --- | --- | --- | --- |
| Active (RF working) | TX | Bluetooth LE @ 19.0 dBm | 309 |
| Active (RF working) | TX | Bluetooth LE @ 9.0 dBm | 190 |
| Active (RF working) | TX | Bluetooth LE @ 0 dBm | 130 |
| Active (RF working) | TX | Bluetooth LE @ −16.0 dBm | 93 |
| Active (RF working) | RX | Bluetooth LE | 73 |

**Table 6-6. Current Consumption for 802.15.4 in Active Mode**

| Work Mode | RF Condition | Description | Peak (mA) |
| --- | --- | --- | --- |
| Active (RF working) | TX | 802.15.4 @ 19.0 dBm | 302 |
| Active (RF working) | TX | 802.15.4 @ 12.0 dBm | 185 |
| Active (RF working) | TX | 802.15.4 @ 0 dBm | 117 |
| Active (RF working) | TX | 802.15.4 @ −16.0 dBm | 91 |
| Active (RF working) | RX | 802.15.4 | 73 |$t$),
 ('current-sleep','Current consumption in sleep modes','[28]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Current consumption in sleep modes. Page: 28. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4.2 Current Consumption in Other Modes. Table 6-7. Current Consumption in Modem-sleep Mode**

| Mode | CPU Frequency (MHz) | Description | Typ (mA), All Peripherals Clocks Disabled | Typ (mA), All Peripherals Clocks Enabled (note 1) |
| --- | --- | --- | --- | --- |
| Modem-sleep (notes 2, 3) | 160 | CPU is running | 27 | 38 |
| Modem-sleep (notes 2, 3) | 160 | CPU is idle | 17 | 28 |
| Modem-sleep (notes 2, 3) | 80 | CPU is running | 19 | 30 |
| Modem-sleep (notes 2, 3) | 80 | CPU is idle | 14 | 25 |

(note 1) In practice, the current consumption might be different depending on which peripherals are enabled.
(note 2) In Modem-sleep mode, Wi-Fi is clock gated.
(note 3) In Modem-sleep mode, the consumption might be higher when accessing flash.

**Table 6-8. Current Consumption in Low-Power Modes**

| Mode | Description | Typ (µA) |
| --- | --- | --- |
| Light-sleep | CPU and wireless communication modules are powered down, peripheral clocks are disabled, and all GPIOs are high-impedance | 180 |
| Light-sleep | CPU, wireless communication modules and peripherals are powered down, and all GPIOs are high-impedance | 35 |
| Deep-sleep | RTC timer and LP memory are powered on | 7 |
| Power off | CHIP_PU is set to low level, the chip is powered off | 1 |$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xC6 ESP32-C6 Development Board','Espressif ESP32-C6-WROOM-1 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxc6-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='ec4f4c5b-ac7e-4960-bca0-8d28ecd7eca6' AND artifact_key='29d709ea008f05f0af3847b325fff860b4b2d2618e9c24df0df981fcc84dd4a5';
 FOR r IN SELECT * FROM (VALUES
 ('wifi-tx','Wi-Fi RF characteristics and TX power','[30]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Wi-Fi RF characteristics and TX power. Page: 30. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7.1 Wi-Fi Radio. Table 7-1. Wi-Fi RF Characteristics; Table 7-2. TX Power with Spectral Mask and EVM Meeting 802.11 Standards**

| Name | Description |
| --- | --- |
| Center frequency range of operating channel | 2412 ~ 2484 MHz |
| Wi-Fi wireless standard | IEEE 802.11b/g/n/ax |

**Table 7-2. TX Power with Spectral Mask and EVM Meeting 802.11 Standards**

| Rate | Min (dBm) | Typ (dBm) | Max (dBm) |
| --- | --- | --- | --- |
| 802.11b, 1 Mbps, DSSS | — | 20.5 | — |
| 802.11b, 11 Mbps, CCK | — | 20.5 | — |
| 802.11g, 6 Mbps, OFDM | — | 20.0 | — |
| 802.11g, 54 Mbps, OFDM | — | 19.0 | — |
| 802.11n, HT20, MCS0 | — | 19.0 | — |
| 802.11n, HT20, MCS7 | — | 18.0 | — |
| 802.11n, HT40, MCS0 | — | 18.5 | — |
| 802.11n, HT40, MCS7 | — | 17.5 | — |
| 802.11ax, HE20, MCS0 | — | 19.0 | — |
| 802.11ax, HE20, MCS9 | — | 15.5 | — |$t$),
 ('ble-802154-rf','Bluetooth LE and 802.15.4 radio highlights','[33,37]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: Bluetooth LE and 802.15.4 radio highlights. Pages: 33, 37. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 7-7. Bluetooth LE RF Characteristics; Table 7-17. 802.15.4 Transmitter Characteristics - 250 Kbps**

| Name | Description |
| --- | --- |
| Center frequency range of operating channel | 2402 ~ 2480 MHz |
| RF transmit power range | −16.0 ~ 19.0 dBm |

**Table 7-17. 802.15.4 Transmitter Characteristics - 250 Kbps**

| Parameter | Min | Typ | Max | Unit |
| --- | --- | --- | --- | --- |
| RF transmit power range | −16.0 | — | 19.0 | dBm |
| EVM | — | 13% | — | — |$t$),
 ('uart-spi','UART and SPI peripherals','[17,18]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-C6-WROOM-1 and ESP32-C6-WROOM-1U Datasheet, Datasheet Version 1.4. Section: UART and SPI peripherals. Pages: 17, 18. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**5.2.1.1 UART Controller and 5.2.1.2 SPI Controller**

The UART Controller in the ESP32-C6 chip facilitates the transmission and reception of asynchronous serial data between the chip and external UART devices. It consists of two UARTs in the main system, and one low-power LP UART.

Feature List
- Programmable baud rates up to 5 MBaud
- RAM shared by TX FIFOs and RX FIFOs
- Support for various lengths of data bits and stop bits
- Parity bit support
- Special character AT_CMD detection
- RS485 protocol support (not supported by LP UART)
- IrDA protocol support (not supported by LP UART)
- High-speed data communication using GDMA (not supported by LP UART)
- Receive timeout feature
- UART as the wake-up source
- Software and hardware flow control

Pin Assignment: For details, see ESP32-C6 Series Datasheet > Section Peripheral Pin Assignment.

ESP32-C6 has the following SPI interfaces:
- SPI0 used by ESP32-C6's cache and GDMA to access in-package or off-package flash
- SPI1 used by the CPU to access in-package or off-package flash
- SPI2 is a general-purpose SPI controller with access to general-purpose DMA channels

SPI0 and SPI1 are reserved for system use, and only SPI2 is available for users.

Features of SPI0 and SPI1
- Supports Single SPI, Dual SPI, Quad SPI (QPI) modes
- Data transmission is in bytes

Features of SPI2
- Supports operation as a master or slave
- Support for GDMA
- Supports Single SPI, Dual SPI, Quad SPI (QPI) modes
- Configurable clock polarity (CPOL) and phase (CPHA)
- Configurable clock frequency
- Data transmission is in bytes
- Configurable read and write data bit order: most-significant bit (MSB) first, or least-significant bit (LSB) first
- As a master
  - Supports 2-line full-duplex communication with clock frequency up to 80 MHz
  - Supports 1-, 2-, 4-line half-duplex communication with clock frequency up to 80 MHz
  - Provides six FSPICS... pins for connection with six independent SPI slaves
  - Configurable CS setup time and hold time
- As a slave
  - Supports 2-line full-duplex communication with clock frequency up to 40 MHz$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xC6 ESP32-C6 Development Board','Espressif ESP32-C6-WROOM-1 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxc6-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE v public.panda_agent_versions; n bigint; d text;
BEGIN
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE source_id='ec4f4c5b-ac7e-4960-bca0-8d28ecd7eca6' AND artifact_key='29d709ea008f05f0af3847b325fff860b4b2d2618e9c24df0df981fcc84dd4a5';
 IF v.state='approved' THEN RETURN; END IF;
 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(logical_chunk_id||':'||text_hash||':'||locator,E'\n' ORDER BY logical_chunk_id),''),'UTF8')),'hex') INTO n,d FROM public.panda_agent_chunks WHERE document_version_id=v.id;
 IF n<>18 THEN RAISE EXCEPTION 'ESPXC6: % chunks, expected 18',n; END IF;
 PERFORM public.panda_agent_seal_version(v.id,v.version,n::int,d);
 PERFORM public.panda_agent_review_version(v.id,v.version+1,'approve','Owner requested Espressif datasheet excerpts on 2026-11-13; tables number-checked against the PDF text layer');
END $m$;
-- @@split
DO $m$ BEGIN
 PERFORM public.panda_agent_store_version('685eed9d-00b8-4e16-b52d-518a47f64b62','21a2640d-4c3b-4e5c-90b9-e17ad00112aa','bb9fd736-3225-4a78-9051-358a6f8147d8',NULL,'309128fc734797fdfb52c0fed3aa9214e083845913ac11066784b358a6ae1c44','27d71971da07c280c6068d08c74720d1a25b8f20cf8494dc1765bdd28d40d435',1280501,$t${"document":"ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet","version":"v1.8, 2026-03-02","source_url":"https://documentation.espressif.com/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf","pdf_sha256":"27d71971da07c280c6068d08c74720d1a25b8f20cf8494dc1765bdd28d40d435","excerpts":[{"key":"features-overview","sha256":"caaca4ca89b1977e99a7b8a7aac0e45ef13747a0d67051c1347af834a7233c20"},{"key":"features-overview--2","sha256":"fed624bddc8a18d1bd627e2f60375036f8a798d6bceb7ff6b56fd5d576428684"},{"key":"variants-flash-psram-1","sha256":"6f3cc568ae736faf7fa5edc41a622e10a602549d8f28feb14b19acfd799ec7cd"},{"key":"variants-flash-psram-2","sha256":"157c84e6ea3532908aea4cf5ee1888fc9128e75719ae9b5a06d1dd9ae8fcb99b"},{"key":"pin-definitions-1","sha256":"6d6543609862586874698b452cb3d06f53bbd47f9fbd4f18a7d16c55fa50a0d6"},{"key":"pin-definitions-2","sha256":"f054187c59ca35f4e2c498804b6b165117d1714520d7a26843222659dd2e6cc1"},{"key":"strapping-pins","sha256":"d285f7d2c72b7063f9cf65bd0e1de4efed4a48606f9869d087f03dd7000d7bf6"},{"key":"boot-mode","sha256":"a40e48f97e7dfe1788dd0aa7ecb35a2671184b1120af8747c5f34b29a87b9b44"},{"key":"absolute-recommended","sha256":"b07dee75b10bc8e19643578a0a80148746ea0c1589cbb696a139c9abd99e0eec"},{"key":"dc-characteristics","sha256":"defbbe65b6766bc7383d5f04de27d14ebdbb077c62143f0747fefa7e1c3e0b60"},{"key":"current-active","sha256":"661252df4a7dea586441989973c1cb5003c35115c624cd56e52c18fdde61ba7c"},{"key":"current-low-power","sha256":"193144ddfc2f1ad718321f12621ffb04cbeaa71cd6d0f875d2c2d420704aeee4"},{"key":"wifi-tx-rf","sha256":"9c2e7ca3d64fc72eabcefc036eba2d1e2a4a62ac73c2ae32ad5e3e486e346e1f"},{"key":"ble-rf","sha256":"6e73cd75671e22c518a80ad0eac53228f3d20778c9b7350de738d6de4c81a5a7"},{"key":"uart-i2c-notes","sha256":"d2d5383b5d518f42d8ccf7d499d68d7a9e54657df0282b04775bb2326b86ba95"}]}$t$,'cacee6d10e3ea8248cdb30a5a626420e4e0259f530f95aced24928b8cb5eaa89','espressif-datasheet-excerpts-v1','386403f66ddfed7a20e2d02758e9bff83e6fd757cb34a89c208a52f03212b384','technical',NULL,'{"captured_at":"2026-11-13T00:00:00+00:00","rights":"vendor_datasheet_short_cited_excerpts_only","copyright_holder":"Espressif Systems","original_url":"https://documentation.espressif.com/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf","document":"ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet","document_version":"v1.8, 2026-03-02","method":"excerpts selected from the PDF text layer; tables transcribed from rendered pages and number-checked; owner requested 2026-11-13"}'::jsonb);
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='685eed9d-00b8-4e16-b52d-518a47f64b62' AND artifact_key='309128fc734797fdfb52c0fed3aa9214e083845913ac11066784b358a6ae1c44';
 FOR r IN SELECT * FROM (VALUES
 ('features-overview','Module features and key specifications','[2]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Module features and key specifications. Page: 2. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features (left column)**

**CPU and On-Chip Memory**
- ESP32-S3 series of SoCs embedded, Xtensa® dual-core 32-bit LX7 microprocessor (with single precision FPU), up to 240 MHz
- 384 KB ROM
- 512 KB SRAM
- 16 KB SRAM in RTC
- Up to 16 MB PSRAM

**Wi-Fi**
- 802.11b/g/n
- Bit rate: 802.11n up to 150 Mbps
- A-MPDU and A-MSDU aggregation
- 0.4 µs guard interval support
- Center frequency range of operating channel: 2412 ~ 2484 MHz

**Bluetooth**
- Bluetooth LE: Bluetooth 5, Bluetooth mesh
- Speed: 125 Kbps, 500 Kbps, 1 Mbps, 2 Mbps
- Advertising extensions
- Multiple advertisement sets
- Channel selection algorithm #2
- Internal co-existence mechanism between Wi-Fi and Bluetooth to share the same antenna

**Peripherals**
- 36 GPIOs$t$),
 ('features-overview--2','Module features and key specifications (continued)','[2]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Module features and key specifications (continued). Page: 2. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**1.1 Features (right column, continued)**

**Peripherals (continued)**
- 36 GPIOs
  - 4 strapping GPIOs
- SPI, LCD interface, Camera interface, UART, I2C, I2S, remote control, pulse counter, LED PWM, full-speed USB 2.0 OTG, USB Serial/JTAG controller, MCPWM, SD/MMC host controller, GDMA, TWAI® controller (compatible with ISO 11898-1), ADC, touch sensor, temperature sensor, timers and watchdogs

**Integrated Components on Module**
- 40 MHz crystal oscillator
- Up to 16 MB Quad SPI flash

**Antenna Options**
- ESP32-S3-WROOM-1: On-board PCB antenna
- ESP32-S3-WROOM-1U: External antenna via a connector

**Operating Conditions**
- Operating voltage/Power supply: 3.0 ~ 3.6 V
- Operating ambient temperature:
  - 65 °C version: −40 ~ 65 °C
  - 85 °C version: −40 ~ 85 °C
  - 105 °C version: −40 ~ 105 °C

**Certification**
- RF certification: See certificates
- Green certification: RoHS/REACH

**Test**
- HTOL/HTSL/uHAST/TCT/ESD$t$),
 ('variants-flash-psram-1','Module variants, flash and PSRAM options (part 1/2)','[3]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Module variants, flash and PSRAM options (part 1/2). Page: 3. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

ESP32-S3-WROOM-1 comes with a PCB antenna. ESP32-S3-WROOM-1U comes with an external antenna connector. A wide selection of module variants are available for customers as shown in Table 1-1 and 1-2. H4 series modules operate at −40 ~ 105 °C ambient temperature, R8 and R16V series modules operate at −40 ~ 65 °C ambient temperature, and other module variants operate at −40 ~ 85 °C ambient temperature. For R8 and R16V series modules with Octal SPI PSRAM, if the PSRAM ECC function is enabled, the maximum ambient temperature can be improved to 85 °C, while the usable size of PSRAM will be reduced by 1/16.

**Table 1-1. ESP32-S3-WROOM-1 Series Comparison (note 1)**

| Part Number (note 2) | Flash (notes 3, 4) | PSRAM (note 4) | Ambient Temp. (°C) (note 5) | Size (mm) (note 6) |
|---|---|---|---|---|
| ESP32-S3-WROOM-1-N4 | 4 MB (Quad SPI) | - | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-N8 | 8 MB (Quad SPI) | - | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-N16 | 16 MB (Quad SPI) | - | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-H4 | 4 MB (Quad SPI) | - | −40 ~ 105 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-N4R2 | 4 MB (Quad SPI) | 2 MB (Quad SPI) | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-N8R2 | 8 MB (Quad SPI) | 2 MB (Quad SPI) | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-N16R2 | 16 MB (Quad SPI) | 2 MB (Quad SPI) | −40 ~ 85 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-N4R8 | 4 MB (Quad SPI) | 8 MB (Octal SPI) | −40 ~ 65 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-N8R8 | 8 MB (Quad SPI) | 8 MB (Octal SPI) | −40 ~ 65 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-N16R8 | 16 MB (Quad SPI) | 8 MB (Octal SPI) | −40 ~ 65 | 18.0 × 25.5 × 3.1 |
| ESP32-S3-WROOM-1-N16R16VA (note 7) | 16 MB (Quad SPI) | 16 MB (Octal SPI) | −40 ~ 65 | 18.0 × 25.5 × 3.1 |

(note 1) This table shares the same notes presented in Table 1-2 below.$t$),
 ('variants-flash-psram-2','Module variants, flash and PSRAM options (part 2/2)','[3,4]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Module variants, flash and PSRAM options (part 2/2). Pages: 3, 4. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 1-2. ESP32-S3-WROOM-1U Series Comparison**

| Part Number (note 2) | Flash (notes 3, 4) | PSRAM (note 4) | Ambient Temp. (°C) (note 5) | Size (mm) (note 6) |
|---|---|---|---|---|
| ESP32-S3-WROOM-1U-N4 | 4 MB (Quad SPI) | - | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-N8 | 8 MB (Quad SPI) | - | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-N16 | 16 MB (Quad SPI) | - | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-H4 | 4 MB (Quad SPI) | - | −40 ~ 105 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-N4R2 | 4 MB (Quad SPI) | 2 MB (Quad SPI) | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-N8R2 | 8 MB (Quad SPI) | 2 MB (Quad SPI) | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-N16R2 | 16 MB (Quad SPI) | 2 MB (Quad SPI) | −40 ~ 85 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-N4R8 | 4 MB (Quad SPI) | 8 MB (Octal SPI) | −40 ~ 65 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-N8R8 | 8 MB (Quad SPI) | 8 MB (Octal SPI) | −40 ~ 65 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-N16R8 | 16 MB (Quad SPI) | 8 MB (Octal SPI) | −40 ~ 65 | 18.0 × 19.2 × 3.2 |
| ESP32-S3-WROOM-1U-N16R16VA (note 7) | 16 MB (Quad SPI) | 16 MB (Octal SPI) | −40 ~ 65 | 18.0 × 19.2 × 3.2 |

(note 2) For customization of ESP32-S3-WROOM-1-H4, ESP32-S3-WROOM-1U-H4, and ESP32-S3-WROOM-1U-N16R16VA, please contact us.
(note 3) By default, the SPI flash on the module operates at a maximum clock frequency of 80 MHz and does not support the auto suspend feature. If you have a requirement for a higher flash clock frequency of 120 MHz or if you need the flash auto suspend feature, please contact us.
(note 4) The modules use PSRAM integrated in the chip's package. For specifications, refer to Section 6.5 Memory Specifications.
(note 5) Ambient temperature specifies the recommended temperature range of the environment immediately outside the Espressif module.
(note 6) For details, refer to Section 10.1 Module Dimensions.
(note 7) Please note that the VDD_SPI voltage is 1.8 V for ESP32-S3-WROOM-1-N16R16VA and ESP32-S3-WROOM-1U-N16R16VA only.$t$),
 ('pin-definitions-1','Pin definitions (part 1/2)','[11]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Pin definitions (part 1/2). Page: 11. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3-1. Pin Definitions** (the module has 41 pins; pin functions in bold font are the default pin functions)

| Name | No. | Type (note a) | Function |
|---|---|---|---|
| GND | 1 | P | GND |
| 3V3 | 2 | P | Power supply |
| EN | 3 | I | High: on, enables the chip. Low: off, the chip powers off. Note: Do not leave the EN pin floating. |
| IO4 | 4 | I/O/T | RTC_GPIO4, **GPIO4**, TOUCH4, ADC1_CH3 |
| IO5 | 5 | I/O/T | RTC_GPIO5, **GPIO5**, TOUCH5, ADC1_CH4 |
| IO6 | 6 | I/O/T | RTC_GPIO6, **GPIO6**, TOUCH6, ADC1_CH5 |
| IO7 | 7 | I/O/T | RTC_GPIO7, **GPIO7**, TOUCH7, ADC1_CH6 |
| IO15 | 8 | I/O/T | RTC_GPIO15, **GPIO15**, U0RTS, ADC2_CH4, XTAL_32K_P |
| IO16 | 9 | I/O/T | RTC_GPIO16, **GPIO16**, U0CTS, ADC2_CH5, XTAL_32K_N |
| IO17 | 10 | I/O/T | RTC_GPIO17, **GPIO17**, U1TXD, ADC2_CH6 |
| IO18 | 11 | I/O/T | RTC_GPIO18, **GPIO18**, U1RXD, ADC2_CH7, CLK_OUT3 |
| IO8 | 12 | I/O/T | RTC_GPIO8, **GPIO8**, TOUCH8, ADC1_CH7, SUBSPICS1 |
| IO19 | 13 | I/O/T | RTC_GPIO19, GPIO19, U1RTS, ADC2_CH8, CLK_OUT2, **USB_D-** |
| IO20 | 14 | I/O/T | RTC_GPIO20, GPIO20, U1CTS, ADC2_CH9, CLK_OUT1, **USB_D+** |
| IO3 | 15 | I/O/T | RTC_GPIO3, **GPIO3**, TOUCH3, ADC1_CH2 |
| IO46 | 16 | I/O/T | **GPIO46** |
| IO9 | 17 | I/O/T | RTC_GPIO9, **GPIO9**, TOUCH9, ADC1_CH8, FSPIHD, SUBSPIHD |
| IO10 | 18 | I/O/T | RTC_GPIO10, **GPIO10**, TOUCH10, ADC1_CH9, FSPICS0, FSPIIO4, SUBSPICS0 |
| IO11 | 19 | I/O/T | RTC_GPIO11, **GPIO11**, TOUCH11, ADC2_CH0, FSPID, FSPIIO5, SUBSPID |
| IO12 | 20 | I/O/T | RTC_GPIO12, **GPIO12**, TOUCH12, ADC2_CH1, FSPICLK, FSPIIO6, SUBSPICLK |
| IO13 | 21 | I/O/T | RTC_GPIO13, **GPIO13**, TOUCH13, ADC2_CH2, FSPIQ, FSPIIO7, SUBSPIQ |
| IO14 | 22 | I/O/T | RTC_GPIO14, **GPIO14**, TOUCH14, ADC2_CH3, FSPIWP, FSPIDQS, SUBSPIWP |
| IO21 | 23 | I/O/T | RTC_GPIO21, **GPIO21** |

(note a) P: power supply; I: input; O: output; T: high impedance. Pin functions in bold font are the default pin functions. For pin 28 ~ 30, the default function is decided by eFuse bit.
(Table 3-1 continues with pins 24 to 41 in the next entry)$t$),
 ('pin-definitions-2','Pin definitions (part 2/2)','[11,12]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Pin definitions (part 2/2). Pages: 11, 12. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 3-1. Pin Definitions (continued)** (pin functions in bold font are the default pin functions)

| Name | No. | Type (note a) | Function |
|---|---|---|---|
| IO47 (note c) | 24 | I/O/T | SPICLK_P_DIFF, **GPIO47**, SUBSPICLK_P_DIFF |
| IO48 (note c) | 25 | I/O/T | SPICLK_N_DIFF, **GPIO48**, SUBSPICLK_N_DIFF |
| IO45 | 26 | I/O/T | **GPIO45** |
| IO0 | 27 | I/O/T | RTC_GPIO0, **GPIO0** |
| IO35 (note b) | 28 | I/O/T | SPIIO6, **GPIO35**, FSPID, SUBSPID |
| IO36 (note b) | 29 | I/O/T | SPIIO7, **GPIO36**, FSPICLK, SUBSPICLK |
| IO37 (note b) | 30 | I/O/T | SPIDQS, **GPIO37**, FSPIQ, SUBSPIQ |
| IO38 | 31 | I/O/T | **GPIO38**, FSPIWP, SUBSPIWP |
| IO39 | 32 | I/O/T | **MTCK**, GPIO39, CLK_OUT3, SUBSPICS1 |
| IO40 | 33 | I/O/T | **MTDO**, GPIO40, CLK_OUT2 |
| IO41 | 34 | I/O/T | **MTDI**, GPIO41, CLK_OUT1 |
| IO42 | 35 | I/O/T | **MTMS**, GPIO42 |
| RXD0 | 36 | I/O/T | **U0RXD**, GPIO44, CLK_OUT2 |
| TXD0 | 37 | I/O/T | **U0TXD**, GPIO43, CLK_OUT1 |
| IO2 | 38 | I/O/T | RTC_GPIO2, **GPIO2**, TOUCH2, ADC1_CH1 |
| IO1 | 39 | I/O/T | RTC_GPIO1, **GPIO1**, TOUCH1, ADC1_CH0 |
| GND | 40 | P | GND |
| EPAD | 41 | P | GND |

(note a) P: power supply; I: input; O: output; T: high impedance. Pin functions in bold font are the default pin functions. For pin 28 ~ 30, the default function is decided by eFuse bit.
(note b) For modules with Octal SPI PSRAM, i.e., modules embedded with ESP32-S3R8 or ESP32-S3R16V, pins IO35, IO36, and IO37 are connected to the Octal SPI PSRAM and are not available for other uses.
(note c) For modules embedded with ESP32-S3R16V, as the VDD_SPI voltage of the ESP32-S3R16V chip is set to 1.8 V, the working voltage for GPIO47 and GPIO48 is also 1.8 V, which is different from other GPIOs.$t$),
 ('strapping-pins','Strapping pins and default configuration','[13]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Strapping pins and default configuration. Page: 13. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4 Boot Configurations: strapping pins and Table 4-1. Default Configuration of Strapping Pins**

The chip allows for configuring the following boot parameters through strapping pins and eFuse bits at power-up or a hardware reset, without microcontroller interaction.

- Chip boot mode
  - Strapping pin: GPIO0 and GPIO46
- VDD_SPI voltage
  - Strapping pin: GPIO45
  - eFuse parameter: EFUSE_VDD_SPI_FORCE and EFUSE_VDD_SPI_TIEH
- ROM message printing
  - Strapping pin: GPIO46
  - eFuse parameter: EFUSE_UART_PRINT_CONTROL and EFUSE_DIS_USB_SERIAL_JTAG_ROM_PRINT
- JTAG signal source
  - Strapping pin: GPIO3
  - eFuse parameter: EFUSE_DIS_PAD_JTAG, EFUSE_DIS_USB_JTAG, and EFUSE_STRAP_JTAG_SEL

The default values of all the above eFuse parameters are 0, which means that they are not burnt. Given that eFuse is one-time programmable, once programmed to 1, it can never be reverted to 0. For how to program eFuse parameters, please refer to ESP32-S3 Technical Reference Manual > Chapter eFuse Controller.

The default values of the strapping pins, namely the logic levels, are determined by pins' internal weak pull-up/pull-down resistors at reset if the pins are not connected to any circuit, or connected to an external high-impedance circuit.

**Table 4-1. Default Configuration of Strapping Pins**

| Strapping Pin | Default Configuration | Bit Value |
|---|---|---|
| GPIO0 | Weak pull-up | 1 |
| GPIO3 | Floating | – |
| GPIO45 | Weak pull-down | 0 |
| GPIO46 | Weak pull-down | 0 |

To change the bit values, the strapping pins should be connected to external pull-down/pull-up resistances. If the ESP32-S3 is used as a device by a host MCU, the strapping pin voltage levels can also be controlled by the host MCU.$t$),
 ('boot-mode','Chip boot mode and download boot','[14,15]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Chip boot mode and download boot. Pages: 14, 15. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**4.1 Chip Boot Mode Control**

GPIO0 and GPIO46 control the boot mode after the reset is released. See Table 4-3 Chip Boot Mode Control.

**Table 4-3. Chip Boot Mode Control**

| Boot Mode | GPIO0 | GPIO46 |
|---|---|---|
| **SPI Boot** | **1** | Any value |
| Joint Download Boot (note 2) | 0 | 0 |

(note 1) Bold marks the default value and configuration.
(note 2) Joint Download Boot mode supports the following download methods:
- USB Download Boot:
  - USB-Serial-JTAG Download Boot
  - USB-OTG Download Boot
- UART Download Boot

In SPI Boot mode, the ROM bootloader loads and executes the program from SPI flash to boot the system.

In Joint Download Boot mode, users can download binary files into flash using UART0 or USB interface. It is also possible to download binary files into SRAM and execute it from SRAM.

In addition to SPI Boot and Joint Download Boot modes, ESP32-S3 also supports SPI Download Boot mode. For details, please see ESP32-S3 Technical Reference Manual > Chapter Chip Boot Control.$t$),
 ('absolute-recommended','Absolute maximum ratings and recommended operating conditions','[27]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Absolute maximum ratings and recommended operating conditions. Page: 27. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.1 Absolute Maximum Ratings**

Stresses above those listed in Table 6-1 Absolute Maximum Ratings may cause permanent damage to the device. These are stress ratings only and functional operation of the device at these or any other conditions beyond those indicated under Table 6-2 Recommended Operating Conditions is not implied. Exposure to absolute-maximum-rated conditions for extended periods may affect device reliability.

**Table 6-1. Absolute Maximum Ratings**

| Symbol | Parameter | Min | Max | Unit |
|---|---|---|---|---|
| VDD33 | Power supply voltage | −0.3 | 3.6 | V |
| T_STORE | Storage temperature | −40 | 105 | °C |

**6.2 Recommended Operating Conditions**

**Table 6-2. Recommended Operating Conditions**

| Symbol | Parameter | Condition | Min | Typ | Max | Unit |
|---|---|---|---|---|---|---|
| VDD33 | Power supply voltage |  | 3.0 | 3.3 | 3.6 | V |
| I_VDD | Current delivered by external power supply |  | 0.5 | — | — | A |
| T_A | Operating ambient temperature | 65 °C version | −40 | — | 65 | °C |
| T_A | Operating ambient temperature | 85 °C version | −40 | — | 85 | °C |
| T_A | Operating ambient temperature | 105 °C version | −40 | — | 105 | °C |$t$),
 ('dc-characteristics','DC characteristics (3.3 V, 25 C)','[27,28]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: DC characteristics (3.3 V, 25 C). Pages: 27, 28. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.3 DC Characteristics (3.3 V, 25 °C)**

**Table 6-3. DC Characteristics (3.3 V, 25 °C)**

| Parameter | Description | Min | Typ | Max | Unit |
|---|---|---|---|---|---|
| C_IN | Pin capacitance | — | 2 | — | pF |
| V_IH | High-level input voltage | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| V_IL | Low-level input voltage | −0.3 | — | 0.25 × VDD (note 1) | V |
| I_IH | High-level input current | — | — | 50 | nA |
| I_IL | Low-level input current | — | — | 50 | nA |
| V_OH (note 2) | High-level output voltage | 0.8 × VDD (note 1) | — | — | V |
| V_OL (note 2) | Low-level output voltage | — | — | 0.1 × VDD (note 1) | V |
| I_OH | High-level source current (VDD (note 1) = 3.3 V, V_OH >= 2.64 V, PAD_DRIVER = 3) | — | 40 | — | mA |
| I_OL | Low-level sink current (VDD (note 1) = 3.3 V, V_OL = 0.495 V, PAD_DRIVER = 3) | — | 28 | — | mA |
| R_PU | Internal weak pull-up resistor | — | 45 | — | kΩ |
| R_PD | Internal weak pull-down resistor | — | 45 | — | kΩ |
| V_IH_nRST | Chip reset release voltage (EN voltage is within the specified range) | 0.75 × VDD (note 1) | — | VDD (note 1) + 0.3 | V |
| V_IL_nRST | Chip reset voltage (EN voltage is within the specified range) | −0.3 | — | 0.25 × VDD (note 1) | V |

(note 1) VDD – voltage from a power pin of a respective power domain.
(note 2) V_OH and V_OL are measured using high-impedance load.$t$),
 ('current-active','Current consumption in active mode (Wi-Fi and Bluetooth LE)','[28]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Current consumption in active mode (Wi-Fi and Bluetooth LE). Page: 28. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**6.4 Current Consumption Characteristics / 6.4.1 Current Consumption in Active Mode**

With the use of advanced power-management technologies, the module can switch between different power modes. For details on different power modes, please refer to ESP32-S3 Series Datasheet > Section Power Management Unit.

The current consumption measurements are taken with a 3.3 V supply at 25 °C ambient temperature.

TX current consumption is rated at a 100% duty cycle.

RX current consumption is rated when the peripherals are disabled and the CPU idle.

**Table 6-4. Current Consumption for Wi-Fi (2.4 GHz) in Active Mode**

| Work Mode | RF Condition | Description | Peak (mA) |
|---|---|---|---|
| Active (RF working) | TX | 802.11b, 1 Mbps, @20.5 dBm | 355 |
| Active (RF working) | TX | 802.11g, 54 Mbps, @18 dBm | 297 |
| Active (RF working) | TX | 802.11n, HT20, MCS 7, @17.5 dBm | 286 |
| Active (RF working) | TX | 802.11n, HT40, MCS 7, @17 dBm | 285 |
| Active (RF working) | RX | 802.11b/g/n, HT20 | 95 |
| Active (RF working) | RX | 802.11n, HT40 | 97 |

**Table 6-5. Current Consumption for Bluetooth LE in Active Mode**

| Work Mode | RF Condition | Description | Peak (mA) |
|---|---|---|---|
| Active (RF working) | TX | Bluetooth LE @ 20.0 dBm | 344 |
| Active (RF working) | TX | Bluetooth LE @ 9.0 dBm | 202 |
| Active (RF working) | TX | Bluetooth LE @ 0 dBm | 187 |
| Active (RF working) | TX | Bluetooth LE @ −15.0 dBm | 119 |
| Active (RF working) | RX | Bluetooth LE | 93 |$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xS3 ESP32-S3 Development Board','Espressif ESP32-S3-WROOM-1 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxs3-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE vid uuid; r record; sec jsonb; lg text; h text; loc text;
BEGIN
 SELECT id INTO STRICT vid FROM public.panda_agent_versions WHERE source_id='685eed9d-00b8-4e16-b52d-518a47f64b62' AND artifact_key='309128fc734797fdfb52c0fed3aa9214e083845913ac11066784b358a6ae1c44';
 FOR r IN SELECT * FROM (VALUES
 ('current-low-power','Current consumption in low-power modes','[30]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Current consumption in low-power modes. Page: 30. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**Table 6-7. Current Consumption in Low-Power Modes**

| Work mode | Description | Sub-condition | Typ (µA) |
|---|---|---|---|
| Light-sleep (note 1) | VDD_SPI and Wi-Fi are powered down, and all GPIOs are high-impedance. |  | 240 |
| Deep-sleep | The ULP co-processor is powered on (note 2) | ULP-FSM | 170 |
| Deep-sleep | The ULP co-processor is powered on (note 2) | ULP-RISC-V | 190 |
| Deep-sleep | ULP sensor-monitored pattern (note 3) |  | 18 |
| Deep-sleep | RTC memory and RTC peripherals are powered up. |  | 8 |
| Deep-sleep | RTC memory is powered up. RTC peripherals are powered down. |  | 7 |
| Power off | EN is set to low level. The chip is shut down. |  | 1 |

(note 1) In Light-sleep mode, all related SPI pins are pulled up. For chips embedded with PSRAM, please add corresponding PSRAM consumption values, e.g., 140 µA for 8 MB 8-line PSRAM (3.3 V), 200 µA for 8 MB 8-line PSRAM (1.8 V) and 40 µA for 2 MB 4-line PSRAM (3.3 V).
(note 2) During Deep-sleep, when the ULP co-processor is powered on, peripherals such as GPIO and I2C are able to operate.
(note 3) The "ULP sensor-monitored pattern" refers to the mode where the ULP coprocessor or the sensor works periodically. When touch sensors work with a duty cycle of 1%, the typical current consumption is 18 µA.$t$),
 ('wifi-tx-rf','Wi-Fi RF characteristics and TX power','[32]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Wi-Fi RF characteristics and TX power. Page: 32. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7.1 Wi-Fi Radio**

**Table 7-1. Wi-Fi RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2412 ~ 2484 MHz |
| Wi-Fi wireless standard | IEEE 802.11b/g/n |

**7.1.1 Wi-Fi RF Transmitter (TX) Characteristics**

**Table 7-2. TX Power with Spectral Mask and EVM Meeting 802.11 Standards**

| Rate | Min (dBm) | Typ (dBm) | Max (dBm) |
|---|---|---|---|
| 802.11b, 1 Mbps | — | 20.5 | — |
| 802.11b, 11 Mbps | — | 20.5 | — |
| 802.11g, 6 Mbps | — | 20.0 | — |
| 802.11g, 54 Mbps | — | 18.0 | — |
| 802.11n, HT20, MCS 0 | — | 19.0 | — |
| 802.11n, HT20, MCS 7 | — | 17.5 | — |
| 802.11n, HT40, MCS 0 | — | 18.5 | — |
| 802.11n, HT40, MCS 7 | — | 17.0 | — |$t$),
 ('ble-rf','Bluetooth LE RF characteristics','[34]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: Bluetooth LE RF characteristics. Page: 34. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**7.2 Bluetooth LE Radio**

**Table 7-7. Bluetooth LE RF Characteristics**

| Name | Description |
|---|---|
| Center frequency range of operating channel | 2402 ~ 2480 MHz |
| RF transmit power range | −24.0 ~ 20.0 dBm |$t$),
 ('uart-i2c-notes','UART and I2C peripheral notes','[17,18]',$t$Espressif datasheet excerpt (manufacturer data, not PandaByte listing text). Document: ESP32-S3-WROOM-1 and ESP32-S3-WROOM-1U Datasheet, v1.8, 2026-03-02. Section: UART and I2C peripheral notes. Pages: 17, 18. This is the module maker's data for the module used on this board; the PandaByte board's own wiring and pin labels can differ.

**5.2.1.1 UART Controller**

ESP32-S3 has three UART (Universal Asynchronous Receiver Transmitter) controllers, i.e., UART0, UART1, and UART2, which support IrDA and asynchronous communication (RS232 and RS485) at a speed of up to 5 Mbps.

Feature List
- Three clock sources that can be divided
- Programmable baud rate
- 1024 x 8-bit RAM shared by TX FIFOs and RX FIFOs of the three UART controllers
- Full-duplex asynchronous communication
- Automatic baud rate detection of input signals
- Data bits ranging from 5 to 8
- Stop bits of 1, 1.5, 2, or 3 bits
- Parity bit
- Special character AT_CMD detection
- RS485 protocol
- IrDA protocol
- High-speed data communication using GDMA
- UART as wake-up source
- Software and hardware flow control

For details, see ESP32-S3 Technical Reference Manual > Chapter UART Controller.

Pin Assignment: For details, see ESP32-S3 Series Datasheet > Section Peripheral Pin Assignment.

**5.2.1.2 I2C Interface**

ESP32-S3 has two I2C bus interfaces which are used for I2C master mode or slave mode, depending on the user's configuration.

Feature List
- Standard mode (100 kbit/s)
- Fast mode (400 kbit/s)
- Up to 800 kbit/s (constrained by SCL and SDA pull-up strength)
- 7-bit and 10-bit addressing mode
- Double addressing mode (slave addressing and slave register addressing)

The hardware provides a command abstraction layer to simplify the usage of the I2C peripheral.

For details, see ESP32-S3 Technical Reference Manual > Chapter I2C Controller.

Pin Assignment: For details, see ESP32-S3 Series Datasheet > Section Peripheral Pin Assignment.$t$)
 ) AS t(k,title,pages,body) LOOP
  sec := jsonb_build_array('PandaByte xS3 ESP32-S3 Development Board','Espressif ESP32-S3-WROOM-1 datasheet',r.title);
  lg := encode(sha256(convert_to('["espxs3-espressif-'||r.k||'",'||sec::text||',1]','UTF8')),'hex');
  h := encode(sha256(convert_to(r.body,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(r.body,E'\n'),1),'section_path',sec,'kind','datasheet_excerpt','pages',r.pages::jsonb,'review_status','approved','review_reason',null)::text;
  PERFORM public.panda_agent_add_chunk(vid,lg,encode(sha256(convert_to(lg||':espressif-datasheet-excerpts-v1:excerpt:'||h,'UTF8')),'hex'),r.body,h,loc);
 END LOOP;
END $m$;
-- @@split
DO $m$
DECLARE v public.panda_agent_versions; n bigint; d text;
BEGIN
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE source_id='685eed9d-00b8-4e16-b52d-518a47f64b62' AND artifact_key='309128fc734797fdfb52c0fed3aa9214e083845913ac11066784b358a6ae1c44';
 IF v.state='approved' THEN RETURN; END IF;
 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(logical_chunk_id||':'||text_hash||':'||locator,E'\n' ORDER BY logical_chunk_id),''),'UTF8')),'hex') INTO n,d FROM public.panda_agent_chunks WHERE document_version_id=v.id;
 IF n<>15 THEN RAISE EXCEPTION 'ESPXS3: % chunks, expected 15',n; END IF;
 PERFORM public.panda_agent_seal_version(v.id,v.version,n::int,d);
 PERFORM public.panda_agent_review_version(v.id,v.version+1,'approve','Owner requested Espressif datasheet excerpts on 2026-11-13; tables number-checked against the PDF text layer');
END $m$;
-- @@split
DO $m$
DECLARE cfg constant text := '47d91adb459d6fcebfe928bbb4e875cb4ab1f5949e11c8b04d708bc503063019'; base constant uuid := '7dec5968-47ba-4f05-b8f4-2704294b0bb6'; items jsonb; manifest text; n bigint; rid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.panda_agent_releases WHERE id=base AND config_hash=cfg AND member_count=290 AND state='candidate' AND sealed) THEN RAISE EXCEPTION 'unexpected base release'; END IF;
 WITH members AS (
  SELECT document_version_id v,logical_chunk_id l,text_hash t,generation g FROM public.panda_agent_release_items WHERE release_id=base
  UNION ALL
  SELECT c.document_version_id,c.logical_chunk_id,c.text_hash,s.eligibility_generation FROM public.panda_agent_chunks c
   JOIN public.panda_agent_versions vv ON vv.id=c.document_version_id JOIN public.panda_agent_sources s ON s.id=vv.source_id
   WHERE vv.parser='espressif-datasheet-excerpts-v1' AND vv.state='approved' AND vv.scope='technical')
 SELECT count(*),jsonb_agg(jsonb_build_object('version',v,'logical',l,'hash',t,'generation',g)),
  encode(sha256(convert_to(cfg||E'\n'||string_agg(v::text||':'||l||':'||t||':'||g::text,E'\n' ORDER BY v,l),'UTF8')),'hex')
 INTO n,items,manifest FROM members;
 IF n<>395 THEN RAISE EXCEPTION 'members %, expected 395',n; END IF;
 rid := public.panda_agent_seal_candidate(cfg,manifest,n::int,items);
END $m$;
