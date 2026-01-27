<p align="center">
  <a href="http://liveperson.com/" target="blank"><img src="https://lpcdn.lpsnmedia.net/lp-le-ui/15.12.2-release_2790/img/assets/img/live-person_logo.svg?04edc45d88101dc38b35" width="120" alt="Liveperson" /></a>
</p>

# Conversation Simulator

## Installation

### 1. Install Conversation Simulator in Conversation Cloud as a Private Application
- Download the postman collection from `CCUI_install/Conversation Simulator API.postman_collection.json`

### 2. Copy environment files
- Copy `*.env` files into root folder

### 3. Copy Google Cloud keys
- Copy `keys` folder into root folder (Google Cloud keys)

## Running the Application

### Running Locally

**Important:** When starting the application, configurations for all installed accounts will be retrieved and processed. During startup, service workers (bot users) will be signed in for these accounts. This would invalidate tokens in running accounts in production - which is not good.

To work around this and run the application locally, you can set the following `.env` variables:
```
RESTRICT_ACCOUNT=true
DEVELOPER_ACCOUNT_ID=31487986,70071528
```

This will isolate the application to retrieve only the configurations for specified accounts.

### Running with Node

1. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```

2. Run the application:
   ```bash
   npm run start:dev
   ```

### Running with Docker

1. Ensure Docker is running
2. Build and run:
   ```bash
   docker compose up --build
   ```

### Tunneling for Local Development

For running on localhost, you will also need to run ngrok (or similar tunneler) and point to `localhost:8081` (where the simulation API will be running):

```bash
ngrok http 8081
```

  