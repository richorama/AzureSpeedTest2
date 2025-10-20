#!/bin/bash

# Azure Speed Test - Update CORS Configuration
# This script applies CORS configuration to all storage accounts in the speedtest-rg resource group

set -e

echo "🚀 Starting CORS configuration update for all Azure Speed Test storage accounts..."

# Get list of storage accounts
STORAGE_ACCOUNTS=$(az storage account list --resource-group speedtest-rg --query "[].name" -o tsv)

if [ -z "$STORAGE_ACCOUNTS" ]; then
    echo "❌ No storage accounts found in speedtest-rg resource group"
    exit 1
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TOTAL_ACCOUNTS=$(echo "$STORAGE_ACCOUNTS" | wc -l)
CURRENT=0
SUCCESS_COUNT=0
FAILED_COUNT=0

echo "📊 Found $TOTAL_ACCOUNTS storage accounts to update"
echo ""

# CORS configuration
CORS_RULES='[{"allowedOrigins":["*"],"allowedMethods":["GET","HEAD","OPTIONS"],"allowedHeaders":["*"],"exposedHeaders":["*"],"maxAgeInSeconds":3600}]'

for ACCOUNT in $STORAGE_ACCOUNTS; do
    CURRENT=$((CURRENT + 1))
    echo "[$CURRENT/$TOTAL_ACCOUNTS] Updating CORS for $ACCOUNT..."
    
    RESOURCE_ID="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/speedtest-rg/providers/Microsoft.Storage/storageAccounts/$ACCOUNT/blobServices/default"
    
    if az resource update --ids "$RESOURCE_ID" --set properties.cors.corsRules="$CORS_RULES" > /dev/null 2>&1; then
        echo "  ✅ Successfully configured CORS for $ACCOUNT"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "  ❌ Failed to configure CORS for $ACCOUNT"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
    
    # Small delay to avoid throttling
    sleep 1
done

echo ""
echo "🎉 CORS configuration update completed!"
echo "✅ Successful: $SUCCESS_COUNT"
echo "❌ Failed: $FAILED_COUNT"
echo "📈 Total: $TOTAL_ACCOUNTS"

if [ $FAILED_COUNT -eq 0 ]; then
    echo ""
    echo "🎯 All storage accounts now have CORS enabled for:"
    echo "   - Origins: * (all domains)"
    echo "   - Methods: GET, HEAD, OPTIONS" 
    echo "   - Headers: * (all headers)"
    echo "   - Max Age: 3600 seconds (1 hour)"
    exit 0
else
    echo ""
    echo "⚠️  Some storage accounts failed to update. Please check the errors above."
    exit 1
fi