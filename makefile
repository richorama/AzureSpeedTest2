build:
	-@rm index.min.js
	@echo Lint
	@eslint . --ext .js --ext .jsx
	@echo Build
	@browserify -t babelify index.jsx  -g [ envify --NODE_ENV production ] -g uglifyify  | uglifyjs --compress warnings=false --mangle > index.min.js
	@wc -c index.min.js
	@echo Done
