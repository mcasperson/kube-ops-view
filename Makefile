.PHONY: clean test appjs docker push mock

IMAGE            ?= hjacobs/kube-ops-view
VERSION          ?= $(shell git describe --tags --always --dirty)
TAG              ?= $(VERSION)
TTYFLAGS         = $(shell test -t 0 && echo "-it")

default: docker

clean:
	rm -fr kube_ops_view/static/build

test:
	pipenv run flake8
	pipenv run coverage run --source=kube_ops_view -m py.test
	pipenv run coverage report

appjs:
	docker run $(TTYFLAGS) -u $$(id -u) -v $$(pwd):/workdir -w /workdir/app -e NPM_CONFIG_CACHE=/tmp node:11.4-alpine npm install
	docker run $(TTYFLAGS) -u $$(id -u) -v $$(pwd):/workdir -w /workdir/app -e NPM_CONFIG_CACHE=/tmp node:11.4-alpine npm run build

docker: appjs
	docker build --build-arg "VERSION=$(VERSION)" -t "$(IMAGE):$(TAG)" .
	@echo 'Docker image $(IMAGE):$(TAG) can now be used.'

push: docker
	docker push "$(IMAGE):$(TAG)"

mock:
	docker run $(TTYFLAGS) -p 8080:8080 "$(IMAGE):$(TAG)" --mock

heroku:
	# Log into Heroku first.
	heroku container:login
	# Link to the existing app. Alternatively use "heroku create" to create a new app.
	heroku git:remote -a evening-fjord-52184
	mv Dockerfile Dockerfile-Original
	cp Dockerfile-Heroku Dockerfile
	heroku container:push web
	heroku container:release web
	rm Dockerfile
	mv Dockerfile-Original Dockerfile
