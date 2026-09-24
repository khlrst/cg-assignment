# cg-assignment

Repo contains a pnpm monorepo with packages and apps used for building slice of a custody backend.


### Requirements

- Foundry curl -L https://getfoundry.sh/install | bash && foundryup
- Docker compose
- pnpm 11.1.3

### Asset

you can find token code in the [token package](https://github.com/)

### Steps:
```bash
pnpm install

pnpm build

docker compose up
```

API will be exposed at `http://localhost:3000`


