#!/usr/bin/env bash
set -euo pipefail

TARGET_HOST="${1:-primus.example.com}"
WORDLIST="${WORDLIST:-/usr/share/wordlists/dirb/common.txt}"
OUT_DIR="${OUT_DIR:-security-scans}"

mkdir -p "${OUT_DIR}"

echo "[*] Running nmap service scan against ${TARGET_HOST} ..."
nmap -sV -oX "${OUT_DIR}/nmap.xml" "${TARGET_HOST}"

echo "[*] Running gobuster dir scan against https://${TARGET_HOST} ..."
gobuster dir -u "https://${TARGET_HOST}" -w "${WORDLIST}" -o "${OUT_DIR}/gobuster.txt"

echo "[*] Running nikto scan against https://${TARGET_HOST} ..."
nikto -h "https://${TARGET_HOST}" -o "${OUT_DIR}/nikto.txt"

echo "[*] Scans complete. Results in ${OUT_DIR}/"


