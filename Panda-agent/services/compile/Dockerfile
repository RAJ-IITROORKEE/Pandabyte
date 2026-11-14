# Node 22 Lambda base (Amazon Linux 2023): the compiler is arduino-cli, Node only runs the thin handler, and 22 is
# the long-established LTS image. The handler uses nothing 24-specific.
FROM public.ecr.aws/lambda/nodejs:22

ARG ARDUINO_CLI_VERSION=1.3.1
ARG ESP32_CORE=3.3.0
ARG ESP8266_CORE=3.1.2

# python3 is needed by the esp8266 core tools; python3.11 runs esptool for the esp32 core (see below); tar/gzip unpack the CLI release.
RUN microdnf install -y python3 python3.11 python3.11-pip tar gzip && microdnf clean all

ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino/data \
    ARDUINO_DIRECTORIES_USER=/opt/arduino/user \
    ARDUINO_DIRECTORIES_DOWNLOADS=/opt/arduino/dl \
    ARDUINO_UPDATER_ENABLE_NOTIFICATION=false \
    PATH=/opt/arduino/bin:$PATH

# Download with Node (no curl in the base image).
RUN mkdir -p /opt/arduino/bin /opt/arduino/data /opt/arduino/user /opt/arduino/dl && \
    node -e "fetch('https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz').then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer()}).then(b=>require('fs').writeFileSync('/tmp/cli.tgz',Buffer.from(b)))" && \
    tar -xzf /tmp/cli.tgz -C /opt/arduino/bin arduino-cli && rm /tmp/cli.tgz

RUN arduino-cli config init --overwrite && \
    arduino-cli config add board_manager.additional_urls https://arduino.esp8266.com/stable/package_esp8266com_index.json && \
    arduino-cli core update-index && \
    arduino-cli core install esp32:esp32@${ESP32_CORE} esp8266:esp8266@${ESP8266_CORE}

# The esp32 core's bundled esptool binary needs glibc 2.35; this image has 2.34 (build failed 14 Nov 2026).
# Run the same esptool version from PyPI instead, behind the bundled file name.
RUN for dir in /opt/arduino/data/packages/esp32/tools/esptool_py/*/; do \
      python3.11 -m pip install --no-cache-dir "esptool==$(basename "$dir")" && \
      printf '#!/bin/sh\nexec python3.11 -m esptool "$@"\n' > "$dir/esptool" && chmod +x "$dir/esptool" || exit 1; \
    done && esptool version

# Keep in sync with ALLOWED_LIBRARIES in validate.mjs.
RUN arduino-cli lib install \
      "Adafruit BME280 Library@2.2.4" "Adafruit SSD1306@2.5.13" "Adafruit GFX Library@1.11.11" \
      "Adafruit NeoPixel@1.12.3" "Adafruit Unified Sensor@1.1.14" "Adafruit BusIO@1.16.1" \
      "DHT sensor library@1.4.6" "PubSubClient@2.8" "ArduinoJson@7.2.0"

# Pre-warm: one blank sketch per FQBN (core objects land in the cache the handler copies to /tmp at cold start).
RUN mkdir -p /tmp/blank/sketch && echo 'void setup(){} void loop(){}' > /tmp/blank/sketch/sketch.ino && \
    cd /tmp/blank && \
    for f in esp32:esp32:esp32s3 esp32:esp32:esp32c3 esp32:esp32:esp32c5 esp32:esp32:esp32c6 esp32:esp32:esp32 esp8266:esp8266:nodemcuv2; do \
      arduino-cli compile --fqbn $f --build-path /tmp/blank/build --build-cache-path /opt/arduino/cache --output-dir /tmp/blank/out sketch || exit 1; \
    done && \
    rm -rf /tmp/blank /opt/arduino/dl /opt/arduino/data/staging /root/.cache && \
    chmod -R a-w /opt/arduino && chmod -R a+rX /opt/arduino

COPY handler.mjs validate.mjs ${LAMBDA_TASK_ROOT}/
CMD ["handler.handler"]
