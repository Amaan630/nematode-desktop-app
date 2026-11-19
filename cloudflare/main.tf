terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.20.0"
    }
  }
}

# Authentication comes from CLOUDFLARE_API_TOKEN, never from app code or checked-in files.
provider "cloudflare" {}

variable "account_id" {
  type        = string
  description = "Cloudflare account owning the Worker and D1 database."
}
variable "workers_subdomain" {
  type        = string
  description = "The account's existing workers.dev subdomain (without .workers.dev)."
}
variable "name" {
  type    = string
  default = "nematode-buddies"
}

resource "cloudflare_d1_database" "buddies" {
  account_id       = var.account_id
  name             = var.name
  read_replication = { mode = "disabled" }
  lifecycle { prevent_destroy = true }
}

resource "cloudflare_workers_script" "buddies" {
  account_id         = var.account_id
  script_name        = var.name
  main_module        = "worker.mjs"
  content_file       = "${path.module}/worker.mjs"
  content_sha256     = filesha256("${path.module}/worker.mjs")
  compatibility_date = "2025-09-01"
  migrations         = { new_tag = "live-v1", new_sqlite_classes = ["LiveHub"] }
  bindings = [{
    name = "DB"
    type = "d1"
    id   = cloudflare_d1_database.buddies.id
    }, {
    name       = "LIVE"
    type       = "durable_object_namespace"
    class_name = "LiveHub"
  }]
}

resource "cloudflare_workers_script_subdomain" "buddies" {
  account_id       = var.account_id
  script_name      = cloudflare_workers_script.buddies.script_name
  enabled          = true
  previews_enabled = false
}

output "backend_url" {
  value = "https://${var.name}.${var.workers_subdomain}.workers.dev"
}
