#!/usr/bin/env sh
set -e

GRADLE_VERSION=8.9
GRADLE_DIR="$HOME/.gradle-lite"
GRADLE_ZIP="$GRADLE_DIR/gradle-${GRADLE_VERSION}-bin.zip"
GRADLE_HOME="$GRADLE_DIR/gradle-${GRADLE_VERSION}"

mkdir -p "$GRADLE_DIR"

if [ ! -d "$GRADLE_HOME" ]; then
  curl -L "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" -o "$GRADLE_ZIP"
  unzip -q "$GRADLE_ZIP" -d "$GRADLE_DIR"
fi

exec "$GRADLE_HOME/bin/gradle" "$@"
