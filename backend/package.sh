#/bin/bash

docker build . -t treehacksdockerimage.azurecr.io/commongrounds_backend
docker image push treehacksdockerimage.azurecr.io/commongrounds_backend
