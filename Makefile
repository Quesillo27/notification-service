dev:
	npm run dev

test:
	npm test

build:
	docker build -t notification-service .

docker:
	docker build -t notification-service .

lint:
	npm exec --yes eslint . || true
