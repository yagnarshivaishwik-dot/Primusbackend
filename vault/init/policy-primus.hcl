path "secret/data/primus/*" {
  capabilities = ["read", "list"]
}

path "secret/data/primus/master-key" {
  capabilities = ["read", "update", "create"]
}


