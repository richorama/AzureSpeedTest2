#!/bin/bash

# Azure Speed Test - Commission New Region
# This script creates a new storage account in a specified region and uploads the cb.json file
# 
# Usage:
#   ./commission-region.sh <region> <friendly-name> <icon-file>
#
# Example:
#   ./commission-region.sh "southafricawest" "South Africa West" "za.svg"

set -e  # Exit on error

# Configuration
RESOURCE_GROUP_NAME="speedtest-rg"
TEMPLATE_FILE="storage-account-template.json"
UNIQUE_SUFFIX=$(date +%s | tail -c 6)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}$1${NC}"
}

# Check arguments
if [ $# -ne 3 ]; then
    print_error "Usage: $0 <azure-region> <friendly-name> <icon-file>"
    print_error "Example: $0 southafricawest \"South Africa West\" za.svg"
    exit 1
fi

AZURE_REGION="$1"
FRIENDLY_NAME="$2"
ICON_FILE="$3"

# Validate inputs
if [ -z "$AZURE_REGION" ] || [ -z "$FRIENDLY_NAME" ] || [ -z "$ICON_FILE" ]; then
    print_error "All parameters are required"
    exit 1
fi

# Check if Azure CLI is installed and logged in
if ! command -v az &> /dev/null; then
    print_error "Azure CLI is not installed. Please install it first."
    exit 1
fi

if ! az account show &> /dev/null; then
    print_error "Not logged in to Azure. Please run 'az login' first."
    exit 1
fi

print_header "=== Commissioning New Azure Region ==="
print_status "Region: $AZURE_REGION"
print_status "Name: $FRIENDLY_NAME"
print_status "Icon: $ICON_FILE"
print_status "Unique suffix: $UNIQUE_SUFFIX"
echo ""

# Generate storage account name
# Remove special characters and shorten if needed
base_name=$(echo "$AZURE_REGION" | sed 's/[^a-z0-9]//g')
if [ ${#base_name} -gt 18 ]; then
    base_name="${base_name:0:18}"
fi
storage_account_name="${base_name}${UNIQUE_SUFFIX}"

print_status "Generated storage account name: $storage_account_name"

# Check if storage account name is valid (must be 3-24 chars, lowercase alphanumeric)
if [ ${#storage_account_name} -lt 3 ] || [ ${#storage_account_name} -gt 24 ]; then
    print_error "Storage account name '$storage_account_name' is invalid (must be 3-24 characters)"
    exit 1
fi

# Check if storage account already exists
if az storage account show --name "$storage_account_name" --resource-group "$RESOURCE_GROUP_NAME" &> /dev/null; then
    print_error "Storage account $storage_account_name already exists"
    exit 1
fi

# Deploy storage account
print_status "Deploying storage account..."
if az deployment group create \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --template-file "$TEMPLATE_FILE" \
    --parameters storageAccountName="$storage_account_name" location="$AZURE_REGION" \
    --name "deploy-$storage_account_name" \
    --output none; then
    
    print_status "✓ Storage account deployed successfully"
else
    print_error "✗ Failed to deploy storage account"
    exit 1
fi

# Get web endpoint
web_endpoint=$(az storage account show --name "$storage_account_name" --resource-group "$RESOURCE_GROUP_NAME" --query "primaryEndpoints.web" --output tsv)

if [ -z "$web_endpoint" ] || [ "$web_endpoint" == "null" ]; then
    print_error "Failed to get web endpoint for storage account"
    exit 1
fi

print_status "Web endpoint: ${web_endpoint}cb.json"

# Enable static website hosting and upload cb.json
print_status "Enabling static website hosting..."
if az storage blob service-properties update \
    --account-name "$storage_account_name" \
    --auth-mode login \
    --static-website \
    --index-document "index.html" \
    --404-document "404.html" > /dev/null 2>&1; then
    print_status "✓ Static website hosting enabled"
else
    print_warning "Could not enable static website hosting (may already be enabled)"
fi

# Create and upload cb.json
cb_content="call('$storage_account_name')"
temp_file=$(mktemp)
echo "$cb_content" > "$temp_file"

print_status "Uploading cb.json with content: $cb_content"
if az storage blob upload \
    --account-name "$storage_account_name" \
    --auth-mode login \
    --container-name "\$web" \
    --name "cb.json" \
    --file "$temp_file" \
    --content-type "application/json" \
    --overwrite > /dev/null 2>&1; then
    
    print_status "✓ cb.json uploaded successfully"
else
    print_error "✗ Failed to upload cb.json"
    rm -f "$temp_file"
    exit 1
fi

# Cleanup
rm -f "$temp_file"

# Test the endpoint
print_status "Testing endpoint..."
sleep 5  # Give it a moment to propagate

if curl -s --max-time 10 "${web_endpoint}cb.json" | grep -q "call('$storage_account_name')"; then
    print_status "✓ Endpoint test successful"
else
    print_warning "Endpoint test failed (may need time to propagate)"
fi

echo ""
print_header "=== Region Commission Complete ==="
print_status "Storage Account: $storage_account_name"
print_status "Endpoint: ${web_endpoint}cb.json"
print_status "Expected Content: $cb_content"

echo ""
print_header "=== Next Steps ==="
print_status "Add the following entry to lib/locations.js:"
echo ""
echo "    { domain: \"$storage_account_name\", url: \"${web_endpoint}cb.json\", name: \"$FRIENDLY_NAME\", icon: \"$ICON_FILE\" },"
echo ""
print_status "Then test with: npm run test:endpoints"