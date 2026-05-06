


terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}


variable "platform_name" {
  type    = string
  default = "DevOps.lab"
}

resource "local_file" "infra_manifest" {
  filename = "${path.module}/infrastructure_manifest.txt"
  content  = <<-EOT
    PLATFORM: ${var.platform_name}
    STATUS: Foundation Initialized
    OWNER: sachin
    PROVISIONED_BY: Terraform
  EOT
}

output "manifest_path" {
  value = local_file.infra_manifest.filename
}
