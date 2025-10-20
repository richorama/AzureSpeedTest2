#!/bin/bash

# Azure Speed Test - Upload cb.json files
# This script creates and uploads cb.json files to all storage accounts for latency testing

set -e

echo "🚀 Creating cb.json files for all Azure Speed Test storage accounts..."

# Get list of storage accounts
STORAGE_ACCOUNTS=$(az storage account list --resource-group speedtest-rg --query "[].name" -o tsv)

if [ -z "$STORAGE_ACCOUNTS" ]; then
    echo "❌ No storage accounts found in speedtest-rg resource group"
    exit 1
fi

TOTAL_ACCOUNTS=$(echo "$STORAGE_ACCOUNTS" | wc -l)
CURRENT=0
SUCCESS_COUNT=0
FAILED_COUNT=0

echo "📊 Found $TOTAL_ACCOUNTS storage accounts to configure"
echo ""

# Create temporary directory for cb.json files
TEMP_DIR=$(mktemp -d)
echo "📁 Using temp directory: $TEMP_DIR"

for ACCOUNT in $STORAGE_ACCOUNTS; do
    CURRENT=$((CURRENT + 1))
    echo "[$CURRENT/$TOTAL_ACCOUNTS] Creating cb.json for $ACCOUNT..."
    
    # Create cb.json content
    CB_JSON_FILE="$TEMP_DIR/cb.json"
    echo "call('$ACCOUNT')" > "$CB_JSON_FILE"
    
    # Upload to storage account using SAS token
    if az storage blob upload \
        --account-name "$ACCOUNT" \
        --container-name '$web' \
        --name cb.json \
        --file "$CB_JSON_FILE" \
        --content-type "application/javascript" \
        --auth-mode login > /dev/null 2>&1; then
        echo "  ✅ Successfully uploaded cb.json for $ACCOUNT"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "  ❌ Failed to upload cb.json for $ACCOUNT"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
    
    # Small delay to avoid throttling
    sleep 1
done

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "🎉 cb.json upload completed!"
echo "✅ Successful: $SUCCESS_COUNT"
echo "❌ Failed: $FAILED_COUNT"
echo "📈 Total: $TOTAL_ACCOUNTS"

if [ $FAILED_COUNT -eq 0 ]; then
    echo ""
    echo "🎯 All storage accounts now have cb.json files for latency testing!"
    echo "   Each cb.json contains: call('storage_account_name')"
    exit 0
else
    echo ""
    echo "⚠️  Some cb.json uploads failed. Please check the errors above."
    exit 1
fi