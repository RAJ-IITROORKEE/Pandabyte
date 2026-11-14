# esptool for the esp32 core, fetched where pip has SSL (pip in the Lambda image has none). Must match the core's esptool_py version.
FROM public.ecr.aws/docker/library/python:3.11-slim AS esptool
ARG ESPTOOL_VERSION=5.0.0
RUN pip install --no-cache-dir --target /opt/esptool "esptool==${ESPTOOL_VERSION}"

# Node 22 Lambda base (Amazon Linux 2023): the compiler is arduino-cli, Node only runs the thin handler, and 22 is
# the long-established LTS image. The handler uses nothing 24-specific.
FROM public.ecr.aws/lambda/nodejs:22

ARG ARDUINO_CLI_VERSION=1.3.1
ARG ESP32_CORE=3.3.0
ARG ESP8266_CORE=3.1.2
ARG ESPTOOL_VERSION=5.0.0

# python3 is needed by the esp8266 core tools; python3.11 runs esptool for the esp32 core (see below); tar/gzip unpack the CLI release.
RUN microdnf install -y python3 python3.11 tar gzip && microdnf clean all

ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino/data \
    ARDUINO_DIRECTORIES_USER=/opt/arduino/user \
    ARDUINO_DIRECTORIES_DOWNLOADS=/opt/arduino/dl \
    ARDUINO_UPDATER_ENABLE_NOTIFICATION=false \
    PATH=/opt/arduino/bin:$PATH

COPY --from=esptool /opt/esptool /opt/esptool

# One layer for the whole toolchain: Lambda's 10 GiB limit counts every layer uncompressed, so files deleted or chmod-ed
# in a later layer would still count (the first image was over the limit that way, 14 Nov 2026).
# - Download the CLI with Node (no curl in the base image).
# - The esp32 core's bundled esptool binary needs glibc 2.35 (this image has 2.34): run the same version from PyPI instead.
# - Drop what a compile never uses: debuggers, OpenOCD (emptied; their version folders stay so the core still counts them
#   as installed), and the IDF libraries of chips PandaByte does not sell.
# - Libraries: keep in sync with ALLOWED_LIBRARIES in validate.mjs.
# - Pre-warm one blank sketch per FQBN; the core objects land in the cache the handler copies to /tmp at cold start.
RUN mkdir -p /opt/arduino/bin /opt/arduino/data /opt/arduino/user /opt/arduino/dl && \
    node -e "fetch('https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz').then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer()}).then(b=>require('fs').writeFileSync('/tmp/cli.tgz',Buffer.from(b)))" && \
    tar -xzf /tmp/cli.tgz -C /opt/arduino/bin arduino-cli && rm /tmp/cli.tgz && \
    arduino-cli config init --overwrite && \
    arduino-cli config add board_manager.additional_urls https://arduino.esp8266.com/stable/package_esp8266com_index.json && \
    arduino-cli core update-index && \
    arduino-cli core install esp32:esp32@${ESP32_CORE} esp8266:esp8266@${ESP8266_CORE} && \
    T=/opt/arduino/data/packages/esp32/tools && \
    for dir in $T/esptool_py/*/; do \
      [ "$(basename "$dir")" = "${ESPTOOL_VERSION}" ] || { echo "core wants esptool $(basename "$dir")"; exit 1; }; \
      printf '#!/bin/sh\nPYTHONPATH=/opt/esptool exec python3.11 -m esptool "$@"\n' > "$dir/esptool" && chmod +x "$dir/esptool" || exit 1; \
    done && PYTHONPATH=/opt/esptool python3.11 -m esptool version && \
    rm -rf $T/openocd-esp32/*/* $T/xtensa-esp-elf-gdb/*/* $T/riscv32-esp-elf-gdb/*/* && \
    for chip in esp32s2 esp32c2 esp32c61 esp32h2 esp32p4; do rm -rf $T/esp32-arduino-libs/*/$chip; done && \
    arduino-cli lib install \
      "Adafruit BME280 Library@2.2.4" "Adafruit SSD1306@2.5.13" "Adafruit GFX Library@1.11.11" \
      "Adafruit NeoPixel@1.12.3" "Adafruit Unified Sensor@1.1.14" "Adafruit BusIO@1.16.1" \
      "DHT sensor library@1.4.6" "PubSubClient@2.8" "ArduinoJson@7.2.0" && \
    mkdir -p /tmp/blank/sketch && echo 'void setup(){} void loop(){}' > /tmp/blank/sketch/sketch.ino && \
    cd /tmp/blank && \
    for f in esp32:esp32:esp32s3 esp32:esp32:esp32c3 esp32:esp32:esp32c5 esp32:esp32:esp32c6 esp32:esp32:esp32 esp8266:esp8266:nodemcuv2; do \
      ARDUINO_BUILD_CACHE_PATH=/opt/arduino/cache arduino-cli compile --fqbn $f --build-path /tmp/blank/build --output-dir /tmp/blank/out sketch || exit 1; \
    done && \
    cd / && rm -rf /tmp/blank /opt/arduino/dl /opt/arduino/data/staging /root/.cache && \
    chmod -R a-w,a+rX /opt/arduino && du -sh /opt/arduino /opt/arduino/cache /opt/arduino/data/packages/*

COPY handler.mjs validate.mjs ${LAMBDA_TASK_ROOT}/
CMD ["handler.handler"]
