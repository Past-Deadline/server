# Space Guard

**Team Name:** Past Deadline  
**Hackathon:** AUBG Hackathon 2025  

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Features Summary](#features-summary)
3. [Tech Stack](#tech-stack)
4. [Folder Structure](#folder-structure)
5. [Installation & Run](#installation--run)
6. [API Endpoints](#api-endpoints)
7. [Detailed Code Explanation](#detailed-code-explanation)
   - [DTOs (Data Transfer Objects)](#dtos-data-transfer-objects)
   - [Utilities](#utilities)
   - [Controllers](#controllers)
   - [Services](#services)
   - [Main Module & Bootstrap](#main-module--bootstrap)
8. [API Documentation](#api-documentation)
9. [License](#license)
10. [Authors / Team Members](#authors--team-members)

---

## Project Overview

**Space Guard** is an API built with [NestJS](https://nestjs.com/) and [TypeScript](https://www.typescriptlang.org/) to analyze satellite orbits and help payload teams find commercial rocket launches that may intersect those orbits. Additionally, it offers a **heatmap** view of satellite positions at a specified time, filtered by altitude range, satellite type, and geographic bounding region.

This project was developed for the **AUBG Hackathon 2025** by the team **Past Deadline**.

---

## Features Summary

1. **Heatmap**  
   - Obtain real-time or specified-time satellite positions, filtered by bounding box, altitude, and satellite type.

2. **Schedule**  
   - Based on a target orbit (currently supporting LEO), time window, and points of interest, the system suggests suitable commercial rocket launches that can intercept satellites of interest.

3. **Swagger UI**  
   - Auto-generated documentation at /api for easy interaction with the endpoints.

---

## Tech Stack

- **NestJS** – Backend framework (TypeScript-based)
- **TypeScript** – Strongly typed JavaScript superset
- **Satellite.js** – Orbit computations and transformations (ECI <-> LLA, TLE propagation, etc.)
- **Math.js** – Vector and matrix math operations (useful for orbital mechanics)
- **Swagger** – API documentation generation
- **Node.js** / **npm** – Runtime and package manager

---

## Folder Structure

```
/Users/vladimirpasev/Code/hackaubg/server
└── src
    ├── dto
    │   ├── heatmap.dto.ts              # DTO for Heatmap request payload
    │   ├── keeptrack-satellite.dto.ts  # Interface for KeepTrack satellite objects
    │   └── ScheduleRequirements.dto.ts # DTO for Scheduling request payload
    ├── utils
    │   └── getKeplerianFromRV.ts       # Helper function to derive Keplerian elements from R/V vectors
    ├── app.controller.ts               # Defines the HTTP endpoints (/v01/heatmap, /v01/schedule)
    ├── app.module.ts                   # Root application module
    ├── app.service.ts                  # Core logic for satellite retrieval and heatmap filtering
    ├── main.ts                         # Application entry point (bootstraps NestJS, sets up Swagger)
    └── schedule.service.ts             # Scheduling logic (rocket launch data, orbit intersection checks)
```

---

## Installation & Run

1. **Clone or Download** the repository.
2. **Install Dependencies**:

```bash
npm install
```

3. **Run in Development Mode**:

```bash
npm run start:dev
```

By default, the server listens on http://localhost:3000.

**Note:** This project relies on external data sources:
- Satellite data: https://api.keeptrack.space/v2/sats
- Upcoming rocket launches: https://ll.thespacedevs.com/2.0.0/launch/upcoming/

Ensure you have a stable internet connection when running the server.

---

## API Endpoints

| Endpoint         | Method | Description                                                                 |
|------------------|--------|-----------------------------------------------------------------------------|
| `/v01/heatmap`   | POST   | Returns satellite positions in GeoJSON format for a specific timestamp and filters |
| `/v01/schedule`  | POST   | Returns commercial rocket launches that intersect with targeted orbits          |

**Swagger UI**: [http://localhost:3000/api](http://localhost:3000/api)

---

## Detailed Code Explanation

### DTOs (Data Transfer Objects)

**heatmap.dto.ts**
```ts
export class HeatmapDto {
  minLat?: number;
  maxLat?: number;
  minLon?: number;
  maxLon?: number;
  timestamp: string;
  minAlt: number;
  maxAlt: number;
  types?: (number | string)[];
}
```

**ScheduleRequirements.dto.ts**
```ts
export class TImeFrame {
  start: string;
  end: string;
}

export class ScheduleRequirementsDTO {
  time_frame: TImeFrame;
  orbit: string;
  points_of_interest?: Array<[number, number, number]>;
}
```

**keeptrack-satellite.dto.ts**
```ts
export interface KeepTrackSatellite {
  tle1: string;
  tle2: string;
  name: string;
  type: number;
}
```

---

### Utilities

**getKeplerianFromRV.ts**

- Computes orbital elements from R/V vectors using mathjs
- Uses Earth’s gravitational parameter: `mu = 398600.4418 km^3/s^2`
- Outputs: inclination, RAAN, eccentricity, argument of perigee, true anomaly

---

### Controllers

**app.controller.ts**
```ts
@Controller('v01')
export class AppController {
  @Post('heatmap')
  async heatmap(@Body() heatmapDto: HeatmapDto) {
    return this.appService.heatmap(heatmapDto);
  }

  @Post('schedule')
  async schedule(@Body() requirements: ScheduleRequirementsDTO) {
    return this.scheduleService.schedule({ ...requirements });
  }
}
```

---

### Services

**app.service.ts** – Heatmap Logic
- Fetch satellites from KeepTrack
- Propagate to requested timestamp
- Convert to geodetic coords
- Filter by bbox, altitude, type
- Output GeoJSON FeatureCollection

**schedule.service.ts** – Scheduling Logic
- Fetch launch data from SpaceDevs
- Estimate LEO entry in ECI
- Generate candidate orbits
- Discretize both rocket and satellite orbits
- Check distance < 28 km to consider interception
- Return suitable launches

---

### Main Module & Bootstrap

**app.module.ts**
```ts
@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, ScheduleService],
})
export class AppModule {}
```

**main.ts**
```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Satellite Heatmap API')
    .setDescription('API for retrieving and filtering satellite data from keeptrack.space')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
}
```

---

## API Documentation

After you start the server (`npm run start:dev`), open:
[http://localhost:3000/api](http://localhost:3000/api)  
Interact with the endpoints, see request/response formats, and explore auto-generated docs.

---

## License

This project is licensed under the MIT License. You are free to use, modify, and distribute this project as per the terms of the MIT license.

---

## Authors / Team Members

**Past Deadline** (AUBG Hackathon 2025):
- Nikola Andreev
- Vladimir Pasev
- Nikola Velikov
- Stoyan Chorbov
- Alex Nikolov
- Ivana Likova

We hope **Space Guard** helps you explore orbit scheduling and satellite data with ease! Feel free to reach out or open an issue in the repository.