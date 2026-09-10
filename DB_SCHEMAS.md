# Your Spotify Database Schemas

This document describes the MongoDB schema used by Your Spotify. It combines
the upstream Mongoose models with read-only observations from production on
2026-09-10. Document counts are a point-in-time snapshot.

## Data Model

The `infos` collection is the listening-event fact table. Spotify metadata is
normalized into the `tracks`, `albums`, and `artists` collections.

```text
users._id
   +-- infos.owner
         +-- infos.id              -> tracks.id
         +-- infos.albumId         -> albums.id
         +-- infos.primaryArtistId -> artists.id
         +-- infos.artistIds[]     -> artists.id

tracks.album     -> albums.id
tracks.artists[] -> artists.id
albums.artists[] -> artists.id
users.tracks[]   -> infos._id
```

These relationships are maintained by the application. MongoDB does not
enforce them as foreign keys.

## Collections

| Collection | Production count | Purpose |
| --- | ---: | --- |
| `infos` | 126,505 | Individual listening events |
| `tracks` | 15,345 | Spotify track metadata |
| `albums` | 8,234 | Spotify album metadata |
| `artists` | 5,414 | Spotify artist metadata |
| `users` | 1 | Users, Spotify credentials, and preferences |
| `importerstates` | 1 | Import job progress and status |
| `globalpreferences` | 1 | Instance-wide feature settings |
| `migrations` | 1 | Applied database migration history |
| `privatedatas` | 1 | Server JWT private key |

## `infos`

Each document represents one play.

| Field | Type | Meaning |
| --- | --- | --- |
| `_id` | `ObjectId` | MongoDB event identifier |
| `owner` | `ObjectId` | Reference to `users._id` |
| `id` | `string` | Spotify track ID; references `tracks.id` |
| `albumId` | `string` | Spotify album ID; references `albums.id` |
| `primaryArtistId` | `string` | First or primary Spotify artist ID |
| `artistIds` | `string[]` | All Spotify artist IDs for the track |
| `durationMs` | `number` | Track duration copied onto the event |
| `played_at` | `Date` | Time at which the play began |
| `blacklistedBy` | `string[]`, optional | Exclusion marker: `artist` |

Indexes:

- `_id`
- `id`
- `albumId`
- `primaryArtistId`
- `played_at`

`id` is not unique because a track can be played multiple times. Statistics
normally filter by `owner`, `played_at`, and the absence of `blacklistedBy`.

## `tracks`

Each document contains metadata for one Spotify track.

| Field | Type | Meaning |
| --- | --- | --- |
| `_id` | `ObjectId` | MongoDB metadata identifier |
| `id` | `string` | Unique Spotify track ID |
| `album` | `string` | Spotify album ID; references `albums.id` |
| `artists` | `string[]` | Spotify artist IDs; references `artists.id` |
| `name` | `string` | Track name |
| `duration_ms` | `number` | Track duration |
| `disc_number` | `number` | Disc number |
| `track_number` | `number` | Position on the disc |
| `explicit` | `boolean` | Spotify explicit-content flag |
| `is_local` | `boolean` | Whether this is a local Spotify track |
| `external_urls` | `object` | External Spotify URLs |
| `href` | `string` | Spotify API URL |
| `preview_url` | `string \| null` | Preview audio URL |
| `type` | `string` | Spotify object type |
| `uri` | `string` | Spotify URI |

Indexes:

- `_id`
- Unique `id`
- `album`
- Multikey `artists`

Production documents may also contain historical Spotify response fields such
as `available_markets`, `external_ids`, and `popularity`.

## `albums`

Each document contains metadata for one Spotify album.

| Field | Type | Meaning |
| --- | --- | --- |
| `_id` | `ObjectId` | MongoDB metadata identifier |
| `id` | `string` | Unique Spotify album ID |
| `artists` | `string[]` | Spotify artist IDs; references `artists.id` |
| `name` | `string` | Album name |
| `album_type` | `string` | Spotify album type |
| `copyrights` | `object[]` | Copyright statements |
| `external_urls` | `object` | External Spotify URLs |
| `genres` | `string[]` | Album genres |
| `images` | `SpotifyImage[]` | Album artwork |
| `release_date` | `string` | Spotify release date |
| `release_date_precision` | `string` | Precision of the release date |
| `href` | `string` | Spotify API URL |
| `type` | `string` | Spotify object type |
| `uri` | `string` | Spotify URI |

`SpotifyImage` contains `url`, `height`, and `width`.

Indexes:

- `_id`
- Unique `id`
- Multikey `artists`

Production documents may also contain historical fields such as
`available_markets`, `external_ids`, and `popularity`.

## `artists`

Each document contains metadata for one Spotify artist.

| Field | Type | Meaning |
| --- | --- | --- |
| `_id` | `ObjectId` | MongoDB metadata identifier |
| `id` | `string` | Unique Spotify artist ID |
| `name` | `string` | Artist name |
| `genres` | `string[]` | Spotify genres |
| `images` | `SpotifyImage[]` | Artist images |
| `external_urls` | `object` | External Spotify URLs |
| `href` | `string` | Spotify API URL |
| `type` | `string` | Spotify object type |
| `uri` | `string` | Spotify URI |

Indexes:

- `_id`
- Unique `id`

Production documents may also contain historical `followers` and `popularity`
fields.

## `users`

| Field | Type | Meaning |
| --- | --- | --- |
| `_id` | `ObjectId` | User identifier |
| `username` | `string` | Display name |
| `admin` | `boolean` | Administrator flag |
| `spotifyId` | `string` | Unique Spotify account ID |
| `expiresIn` | `number` | Spotify access-token expiration value |
| `accessToken` | `string \| null` | Sensitive Spotify access token |
| `refreshToken` | `string \| null` | Sensitive Spotify refresh token |
| `lastTimestamp` | `number` | Last history synchronization timestamp |
| `tracks` | `ObjectId[]` | References to `infos._id`; normally excluded |
| `settings` | `object` | User statistics and display preferences |
| `lastImport` | `string \| null` | Last import marker |
| `publicToken` | `string \| null` | Token used for public access |
| `firstListenedAt` | `Date`, optional | Earliest known listening event |

Settings:

| Field | Type | Meaning |
| --- | --- | --- |
| `historyLine` | `boolean` | History-line preference |
| `preferredStatsPeriod` | `string` | Default statistics period |
| `nbElements` | `number` | Number of ranked items to return |
| `metricUsed` | `number \| duration` | Statistics ranking metric |
| `darkMode` | `follow \| dark \| light` | Color-mode preference |
| `timezone` | `string`, optional | Timezone used for date aggregation |
| `dateFormat` | `string` | Preferred date format |
| `blacklistedArtists` | `string[]` | Excluded Spotify artist IDs |

Indexes:

- `_id`
- Unique `spotifyId`
- `publicToken`

This collection contains credentials and must never be exposed directly to a
browser or unauthenticated client.

## Supporting Collections

### `importerstates`

Tracks a Spotify history import:

- `type`: importer type
- `total`: total work items
- `current`: completed work items
- `metadata`: importer-specific metadata
- `user`: reference to `users._id`
- `status`: `progress`, `success`, `failure`, or `failure-removed`
- `createdAt` and `updatedAt`: Mongoose timestamps

### `globalpreferences`

- `allowRegistrations`: enables user registration
- `allowAffinity`: enables affinity-related functionality

Both values default to `true` upstream.

### `migrations`

- `lastRun`: name of the latest migration
- `migrations`: migration history entries

### `privatedatas`

- `jwtPrivateKey`: sensitive server-side JWT signing key

This collection must never be returned by an application API.

## Statistics Semantics

- Normal statistics match one `owner`, an exclusive `played_at` range, and
  events where `blacklistedBy` does not exist.
- Date buckets can be all-time, yearly, weekly, monthly, daily, or hourly.
- Date components are calculated in `users.settings.timezone`, falling back to
  the server timezone.
- Rankings use either event count or summed `durationMs`, according to
  `users.settings.metricUsed`.
- Most artist statistics use `primaryArtistId`. Featured artists in
  `artistIds` do not receive equal attribution in those calculations.
- Album and track details are joined through Spotify string IDs using MongoDB
  aggregation `$lookup` stages.
- A listening session ends when the gap after the preceding track exceeds ten
  minutes.

## Schema Drift

MongoDB is schemaless, and existing documents retain fields after an upstream
Mongoose model stops declaring them. The production metadata collections
therefore contain several Spotify API fields absent from the current upstream
schemas. Consumers should tolerate additional fields and should not infer that
every document contains every observed historical field.
