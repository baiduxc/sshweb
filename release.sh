#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH=$PATH:/usr/local/go/bin
VERSION=$(grep 'var version' main.go | sed 's/.*"\(.*\)".*/\1/')
mkdir -p dist
rm -f dist/*.tar.gz
tar czf "dist/sshweb-${VERSION}-src.tar.gz" --exclude=dist --exclude=.git --exclude=data .
for pair in "linux amd64" "linux arm64" "darwin arm64"; do
  set -- $pair
  GOOS=$1 GOARCH=$2 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "dist/build-sshweb" .
  tar czf "dist/sshweb_${VERSION}_${1}_${2}.tar.gz" -C dist --transform 's/build-sshweb/sshweb/' build-sshweb
  rm -f dist/build-sshweb
done
echo "dist ready for ${VERSION}:"; ls -la dist/
