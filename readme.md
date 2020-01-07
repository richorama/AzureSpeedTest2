![](https://api.travis-ci.org/richorama/AzureSpeedTest2.svg?branch=master)

# Azure Speed Test 2.0

Measures the network latency between your browser and the each of the Azure Data Centers.

## Building the UI

You can use these commands to build the User Interface:

```
$ npm install
$ npm run build
```

## Adding Regions

Not all regions are available to everyone. I have added the regions that are generally available to all,
and some kind individuals have set up additional regions that they have access to.

To add a region, follow this process:

1. Create a storage account, preferably with a name like `speedtestxyz`, where the 'xyz' is an abbreviation of your region name. The storage account can be a standard, locally redundant account (the cheapest kind).
1. Create a `$root` container in blob storage, allowing public blobs (blob listing is not necessary).
1. Add a file called `cb.json`, which contains a single line `call("speedtestxyz")`, where 'speedtestxyz' is the name of your storage account.
1. Fork and clone this repository.
1. Run `npm install`.
1. Edit the `lib/locations.js` file to add a record for your new region (using the correct flag from this [repo](https://github.com/hjnilsson/country-flags/tree/master/svg)).
1. Run `npm run build`
1. Run the site locally (I use [node-static](https://www.npmjs.com/package/node-static)) to test that the site works.
1. Create a pull request.

If you're only able to help with steps 1..3 it would be hugely helpful, I can do the remaining steps.

Thank you!

## License 

MIT 
