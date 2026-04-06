path "secret/data/clutchhh/*" {
  capabilities = ["read", "list"]
}

path "secret/data/clutchhh/master-key" {
  capabilities = ["read", "update", "create"]
}
