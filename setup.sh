#!/bin/sh
set -eu

npm install

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

printf 'Proyecto listo. Ajusta .env y ejecuta npm start\n'
