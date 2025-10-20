#!/bin/bash

# Azure Speed Test - Commission Missing Regions
# This script creates storage accounts for missing Azure regions

set -e

echo "🚀 Commissioning missing Azure regions for Speed Test..."

# Array of missing regions with their display names and suggested storage account names
declare -A MISSING_REGIONS
MISSING_REGIONS=(
    ["austriaeast"]="Austria East"
    ["brazilsoutheast"]="Brazil Southeast" 
    ["chilecentral"]="Chile Central"
    ["francesouth"]="France South"
    ["germanynorth"]="Germany North"
    ["jioindiacentral"]="Jio India Central"
    ["norwaywest"]="Norway West"
    ["southafricawest"]="South Africa West"
    ["spaincentral"]="Spain Central"
    ["switzerlandwest"]="Switzerland West"
    ["taiwan"]="Taiwan"
    ["uaecentral"]="UAE Central"
)

RESOURCE_GROUP="speedtest-rg"
SUCCESS_COUNT=0
FAILED_COUNT=0

echo "📊 Found ${#MISSING_REGIONS[@]} missing regions to add"
echo ""

for region in "${!MISSING_REGIONS[@]}"; do
    region_name="${MISSING_REGIONS[$region]}"
    # Generate storage account name (must be lowercase, no spaces, max 24 chars)
    storage_name="speedtest$(echo ${region} | sed 's/[^a-z0-9]//g' | head -c 15)$(date +%s | tail -c 6)"
    
    echo "🔄 Creating storage account for $region_name ($region)..."
    echo "   Storage account: $storage_name"
    
    # Check if region is available
    if ! az account list-locations --query "[?name=='$region']" --output tsv > /dev/null 2>&1; then
        echo "   ⚠️  Region $region not available in this subscription, skipping..."
        continue
    fi
    
    # Deploy storage account
    if az deployment group create \
        --resource-group "$RESOURCE_GROUP" \
        --template-file "storage-account-template.json" \
        --parameters storageAccountName="$storage_name" location="$region" \
        --output none 2>/dev/null; then
        
        echo "   ✅ Successfully created storage account: $storage_name"
        
        # Get the static website URL
        website_url=$(az storage account show --name "$storage_name" --resource-group "$RESOURCE_GROUP" --query "primaryEndpoints.web" --output tsv 2>/dev/null)
        
        if [ ! -z "$website_url" ]; then
            # Remove trailing slash
            website_url="${website_url%/}"
            echo "   🌐 Website URL: $website_url"
            
            # Generate the locations.js entry
            # Get country code for icon (simplified mapping)
            icon="world.svg" # Default icon
            case $region in
                "austriaeast") icon="at.svg" ;;
                "brazilsoutheast") icon="br.svg" ;;
                "chilecentral") icon="cl.svg" ;;
                "francesouth") icon="fr.svg" ;;
                "germanynorth") icon="de.svg" ;;
                "jioindiacentral") icon="in.svg" ;;
                "norwaywest") icon="no.svg" ;;
                "southafricawest") icon="za.svg" ;;
                "spaincentral") icon="es.svg" ;;
                "switzerlandwest") icon="ch.svg" ;;
                "taiwan") icon="tw.svg" ;;
                "uaecentral") icon="ae.svg" ;;
            esac
            
            echo "   📝 Add this to locations.js:"
            echo "   { domain: \"$(echo $storage_name)\", url: \"$website_url\", name: \"$region_name\", icon: \"$icon\" },"
        fi
        
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        echo ""
    else
        echo "   ❌ Failed to create storage account for $region_name"
        FAILED_COUNT=$((FAILED_COUNT + 1))
        echo ""
    fi
    
    # Small delay to avoid throttling
    sleep 2
done

echo ""
echo "🎉 Missing regions commission completed!"
echo "✅ Successful: $SUCCESS_COUNT"
echo "❌ Failed: $FAILED_COUNT"
echo ""

if [ $SUCCESS_COUNT -gt 0 ]; then
    echo "📋 Next steps:"
    echo "1. Copy the generated location entries above into lib/locations.js"
    echo "2. Run the CORS update script: ./deployment/update-cors.sh"
    echo "3. Upload cb.json files: ./deployment/upload-cb-files.sh"
    echo "4. Test the new regions: npm run test:endpoints"
fi