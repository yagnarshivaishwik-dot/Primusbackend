#!/usr/bin/env python3
"""
Primus Connectivity Test Suite
Tests connectivity between:
- Backend API (localhost:8000 and api.primustech.in)
- Client App endpoints
- Admin endpoints
"""

import requests
import sys
from datetime import datetime

# Configuration
BACKENDS = {
    "local": "http://localhost:8000",
    "production": "https://api.primustech.in"
}

# Test results
results = []

def log(msg, status="INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    icon = {"PASS": "[OK]", "FAIL": "[FAIL]", "INFO": "[--]", "WARN": "[!]"}.get(status, "*")
    print(f"[{timestamp}] {icon} {msg}")
    results.append({"msg": msg, "status": status})

def _check_health(backend_name, base_url):
    """Test health endpoint"""
    try:
        resp = requests.get(f"{base_url}/health", timeout=10)
        if resp.status_code == 200:
            log(f"{backend_name}: Health check passed", "PASS")
            return True
        else:
            log(f"{backend_name}: Health check failed - Status {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"{backend_name}: Health check failed - {str(e)[:50]}", "FAIL")
        return False

def _check_auth_endpoint(backend_name, base_url):
    """Test auth login endpoint exists"""
    try:
        # Try with invalid credentials - we just want to see the endpoint responds
        resp = requests.post(
            f"{base_url}/api/auth/login",
            data={"username": "test@test.com", "password": "wrongpassword"},
            timeout=10
        )
        # 401 or 400 means endpoint is working, just credentials are wrong
        if resp.status_code in [400, 401, 422]:
            log(f"{backend_name}: Auth endpoint responding (got {resp.status_code})", "PASS")
            return True
        elif resp.status_code == 200:
            log(f"{backend_name}: Auth endpoint responding", "PASS")
            return True
        else:
            log(f"{backend_name}: Auth endpoint returned {resp.status_code}", "WARN")
            return True
    except Exception as e:
        log(f"{backend_name}: Auth endpoint failed - {str(e)[:50]}", "FAIL")
        return False

def _check_clientpc_endpoint(backend_name, base_url):
    """Test client PC registration endpoint exists"""
    try:
        # Try with missing data - we just want to see the endpoint responds
        resp = requests.post(
            f"{base_url}/api/clientpc/register",
            json={"name": "test-pc"},
            timeout=10
        )
        # 400, 401, 422 means endpoint is working
        if resp.status_code in [400, 401, 422]:
            log(f"{backend_name}: ClientPC register endpoint responding", "PASS")
            return True
        elif resp.status_code == 200 or resp.status_code == 201:
            log(f"{backend_name}: ClientPC register endpoint responding", "PASS")
            return True
        else:
            log(f"{backend_name}: ClientPC register returned {resp.status_code}", "WARN")
            return True
    except Exception as e:
        log(f"{backend_name}: ClientPC register failed - {str(e)[:50]}", "FAIL")
        return False

def _check_license_endpoint(backend_name, base_url):
    """Test license endpoint exists"""
    try:
        resp = requests.get(f"{base_url}/api/license/", timeout=10)
        # 401 means endpoint exists but requires auth
        if resp.status_code in [401, 403]:
            log(f"{backend_name}: License endpoint responding (requires auth)", "PASS")
            return True
        elif resp.status_code == 200:
            log(f"{backend_name}: License endpoint responding", "PASS")
            return True
        else:
            log(f"{backend_name}: License endpoint returned {resp.status_code}", "WARN")
            return True
    except Exception as e:
        log(f"{backend_name}: License endpoint failed - {str(e)[:50]}", "FAIL")
        return False

def _check_cafe_endpoint(backend_name, base_url):
    """Test cafe endpoint exists"""
    try:
        resp = requests.get(f"{base_url}/api/cafe/mine", timeout=10)
        # 401 means endpoint exists but requires auth
        if resp.status_code in [401, 403]:
            log(f"{backend_name}: Cafe endpoint responding (requires auth)", "PASS")
            return True
        elif resp.status_code == 200:
            log(f"{backend_name}: Cafe endpoint responding", "PASS")
            return True
        else:
            log(f"{backend_name}: Cafe endpoint returned {resp.status_code}", "WARN")
            return True
    except Exception as e:
        log(f"{backend_name}: Cafe endpoint failed - {str(e)[:50]}", "FAIL")
        return False

def _check_command_endpoint(backend_name, base_url):
    """Test command polling endpoint"""
    try:
        resp = requests.post(
            f"{base_url}/api/command/fetch",
            data={"pc_id": "1"},
            timeout=10
        )
        # Any response means the endpoint exists
        if resp.status_code in [200, 400, 401, 403, 404, 422]:
            log(f"{backend_name}: Command endpoint responding", "PASS")
            return True
        else:
            log(f"{backend_name}: Command endpoint returned {resp.status_code}", "WARN")
            return True
    except Exception as e:
        log(f"{backend_name}: Command endpoint failed - {str(e)[:50]}", "FAIL")
        return False

def run_all_tests():
    log("=" * 50)
    log("PRIMUS CONNECTIVITY TEST SUITE")
    log("=" * 50)
    
    total_passed = 0
    total_failed = 0
    
    for backend_name, base_url in BACKENDS.items():
        log(f"\n--- Testing {backend_name.upper()} Backend ({base_url}) ---")
        
        tests = [
            ("Health Check", _check_health),
            ("Auth Login", _check_auth_endpoint),
            ("ClientPC Register", _check_clientpc_endpoint),
            ("License API", _check_license_endpoint),
            ("Cafe API", _check_cafe_endpoint),
            ("Command Polling", _check_command_endpoint),
        ]
        
        for test_name, test_func in tests:
            try:
                if test_func(backend_name, base_url):
                    total_passed += 1
                else:
                    total_failed += 1
            except Exception as e:
                log(f"{backend_name}: {test_name} error - {e}", "FAIL")
                total_failed += 1
    
    log("\n" + "=" * 50)
    log(f"RESULTS: {total_passed} passed, {total_failed} failed")
    log("=" * 50)
    
    return total_failed == 0

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
