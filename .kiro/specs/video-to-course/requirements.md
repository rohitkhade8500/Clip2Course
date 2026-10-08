# Requirements Document

## Introduction

Clip2Course transforms video content into interactive learning courses entirely for free, running client-side in the browser. The system accepts video files (upload) or URLs (YouTube, etc.), extracts transcripts, and uses free-tier LLM APIs to generate quizzes, flashcards, and puzzles. All data persists locally in IndexedDB with no backend or paid services required.

## Glossary

- **VideoManager**: Component responsible for accepting, validating, and extracting audio from video inputs (files or URLs)
- **TranscriptExtractor**: Component responsible for extracting text transcripts from video content via YouTube captions or Web Speech API
- **CourseGenerator**: Component responsible for generating structured interactive course content from transcripts using free-tier LLM APIs
- **CourseStore**: Component responsible for persisting and retrieving courses from IndexedDB
- **LLMProviderChain**: Component that abstracts multiple free-tier LLM providers with automatic fallback and rate-limit management
- **VideoInput**: A user-provided video source, either a file upload or a URL
- **TranscriptResult**: The extracted transcript containing text segments with timestamps
- **CourseData**: The complete generated course including sections, quizzes, flashcards, and puzzles
- **CourseSection**: A segment of a course corresponding to a portion of the video, containing interactive elements
- **IndexedDB**: Browser-based persistent storage used for saving courses locally

## Requirements

### Requirement 1: Video Input Acceptance

**User Story:** As a learner, I want to provide video content via file upload or URL, so that I can generate a course from any video source I have access to.

#### Acceptance Criteria

1. WHEN a user uploads a video file, THE VideoManager SHALL accept files with MIME types video/mp4, video/webm, video/ogg, and video/quicktime and a file size of at least 1KB
2. IF a user uploads a file exceeding 500MB, THEN THE VideoManager SHALL reject the file and display an error message indicating the file exceeds the maximum allowed size of 500MB, before any processing begins
3. IF a user uploads a file with a MIME type other than video/mp4, video/webm, video/ogg, or video/quicktime, THEN THE VideoManager SHALL reject the file and display an error message indicating the supported file formats
4. WHEN a user provides a URL, THE VideoManager SHALL accept URLs matching YouTube (youtube.com, youtu.be), Vimeo (vimeo.com), or direct video link formats (URLs ending in .mp4, .webm, or .ogg)
5. IF a user provides a URL that does not match YouTube, Vimeo, or direct video link patterns, THEN THE VideoManager SHALL reject the URL and display an error message indicating the supported URL formats
6. WHEN a user provides a valid video input, THE VideoManager SHALL extract video metadata containing at minimum: title, duration in seconds, and source type (youtube, vimeo, direct-url, or upload)
7. IF the VideoManager fails to extract metadata from a valid video input, THEN THE VideoManager SHALL display an error message indicating that metadata could not be retrieved and SHALL NOT proceed with further processing

### Requirement 2: YouTube Transcript Extraction

**User Story:** As a learner, I want transcripts to be automatically extracted from YouTube videos, so that I can generate courses from YouTube content without manual transcription.

#### Acceptance Criteria

1. WHEN a YouTube URL is provided, THE TranscriptExtractor SHALL parse the video ID as an 11-character string matching [a-zA-Z0-9_-] from standard YouTube URL formats including watch, short-link, embed, and shorts URLs
2. IF the provided URL does not match any supported YouTube URL format, THEN THE TranscriptExtractor SHALL throw an error indicating the URL is invalid
3. WHEN a valid YouTube video ID is extracted, THE TranscriptExtractor SHALL attempt to fetch captions from at least 3 free transcript sources in sequence, proceeding to the next source only if the current one fails or returns no results
4. WHEN a transcript source returns captions, THE TranscriptExtractor SHALL produce a TranscriptResult containing segments (each with text, startTime in seconds, and endTime in seconds), a fullText string equal to all segment texts joined by spaces, the detected language, and a confidence score of 0.95
5. IF all transcript sources fail to return captions, THEN THE TranscriptExtractor SHALL throw an error indicating the video may lack captions or that transcript sources are unavailable
6. THE TranscriptExtractor SHALL produce transcript segments ordered by startTime in ascending order

### Requirement 3: Browser-Based Audio Transcription

**User Story:** As a learner, I want to transcribe uploaded video files using the browser, so that I can generate courses from my own video files without external services.

#### Acceptance Criteria

1. WHEN a video file is uploaded, THE VideoManager SHALL extract the audio track using the Web Audio API and produce a decodable audio blob
2. IF the uploaded video file contains no audio track or the audio cannot be decoded, THEN THE VideoManager SHALL display an error message indicating the file has no usable audio and abort the transcription process
3. WHEN audio is extracted, THE TranscriptExtractor SHALL split the audio into chunks of 30 seconds each, with the final chunk containing any remaining audio shorter than 30 seconds
4. WHEN audio chunks are processed, THE TranscriptExtractor SHALL use the Web Speech API (SpeechRecognition) to transcribe each chunk independently, skipping chunks that produce no recognized text
5. WHEN browser-based transcription completes with at least one non-empty segment, THE TranscriptExtractor SHALL produce a TranscriptResult with a confidence score of 0.7 and segments ordered chronologically by startTime
6. IF browser-based transcription completes and all chunks produce no recognized text, THEN THE TranscriptExtractor SHALL display an error message indicating the audio could not be transcribed and suggest the user verify the video contains clear speech
7. IF the user's browser does not support the Web Speech API, THEN THE TranscriptExtractor SHALL display a browser compatibility warning and suggest using Chrome or Edge

### Requirement 4: Course Generation via LLM

**User Story:** As a learner, I want my transcript to be transformed into an interactive course with quizzes, flashcards, and puzzles, so that I can learn the video content through active engagement.

#### Acceptance Criteria

1. WHEN a transcript is available, THE CourseGenerator SHALL split the transcript into consecutive sections by accumulating segments until the section duration reaches or exceeds 180 seconds, with a remaining section of fewer than 3 segments merged into the preceding section
2. WHEN splitting into sections, THE CourseGenerator SHALL ensure no transcript segments are lost and all segments appear in exactly one output section
3. WHEN a section is generated, THE CourseGenerator SHALL produce at least one interactive element (quiz question, flashcard, or puzzle) per section
4. WHEN generating quiz questions, THE CourseGenerator SHALL ensure each multiple-choice question has exactly 4 options and a correctAnswer that exists within its options array
5. WHEN generating course sections, THE CourseGenerator SHALL set startTime and endTime such that startTime is strictly less than endTime
6. WHEN assembling the final CourseData, THE CourseGenerator SHALL compute totalQuestions as the exact sum of all quiz questions across all sections
7. WHEN assembling the final CourseData, THE CourseGenerator SHALL compute estimatedTime using the formula: (totalQuestions × 1.5) + (sections.length × 2) minutes
8. IF the LLM provider returns malformed or unparseable JSON, THEN THE CourseGenerator SHALL fall back to local heuristic-based generation and produce a valid CourseSection without throwing an exception
9. IF the transcript contains zero segments, THEN THE CourseGenerator SHALL reject the request and return an error indicating that the transcript is empty

### Requirement 5: LLM Provider Fallback Chain

**User Story:** As a learner, I want course generation to succeed even when an LLM provider is unavailable, so that I always get a course regardless of external service status.

#### Acceptance Criteria

1. THE LLMProviderChain SHALL attempt providers in configured order: Hugging Face Inference API first, then Groq free tier
2. WHEN a provider fails to respond within 15 seconds, returns an HTTP 5xx error, refuses the connection, or returns an HTTP 429 (rate limit exceeded) response, THE LLMProviderChain SHALL skip that provider and attempt the next one in the chain
3. IF all LLM providers fail, THEN THE LLMProviderChain SHALL fall back to local heuristic-based generation that produces at least 1 quiz question and 2 flashcards per section from the prompt content
4. THE LLMProviderChain SHALL return a non-empty string response for every prompt that is a non-empty string of at most 10,000 characters, without throwing an exception
5. WHEN a provider returns a successful response, THE LLMProviderChain SHALL cache the response in memory and return the cached version for identical prompts within the same browser session, retaining a maximum of 50 cached entries using a least-recently-used eviction policy
6. THE LLMProviderChain SHALL use only free-tier API endpoints and remain within each provider's free-tier rate limits by tracking request counts and pausing requests when the limit is reached until the provider's reset window elapses
7. IF a provider responds with a non-empty body but the response cannot be used by the CourseGenerator due to malformed content, THEN THE LLMProviderChain SHALL treat that provider as failed for the current request and attempt the next provider in the chain

### Requirement 6: Course Persistence

**User Story:** As a learner, I want my generated courses saved locally, so that I can revisit them later without regenerating.

#### Acceptance Criteria

1. WHEN a course is successfully generated, THE CourseStore SHALL persist the complete CourseData to IndexedDB within 2 seconds of generation completion
2. WHEN a user requests a saved course by ID and the course exists, THE CourseStore SHALL retrieve a deep-equal copy of the originally stored CourseData and update the lastAccessedAt timestamp
3. WHEN a user requests a saved course by ID and no course with that ID exists, THE CourseStore SHALL return null without throwing an error
4. WHEN a user views the dashboard, THE CourseStore SHALL list all saved courses ordered by lastAccessedAt descending, with summary information including title, total section count, completed section count, quiz scores, and creation date
5. WHEN a user deletes a course, THE CourseStore SHALL remove the course and its associated CourseProgress data from IndexedDB and the course SHALL no longer appear in the listed courses
6. WHEN a user completes sections or quizzes, THE CourseStore SHALL update and persist the CourseProgress including the section ID added to completedSections and the quiz score recorded in quizScores keyed by quiz ID
7. IF an IndexedDB write operation fails due to storage quota exceeded or unavailability, THEN THE CourseStore SHALL return an error indicating the failure reason and SHALL NOT corrupt or partially write existing stored data

### Requirement 7: Course Generation Options

**User Story:** As a learner, I want to customize the difficulty and content types for my generated course, so that I can tailor the learning experience to my needs.

#### Acceptance Criteria

1. WHEN a user selects a difficulty level, THE CourseGenerator SHALL include the selected level (beginner, intermediate, or advanced) in the LLM prompt and generate quiz questions, flashcards, and puzzles that reference only concepts present in the transcript at a complexity matching the chosen level
2. WHEN a user selects interactive content types, THE CourseGenerator SHALL generate only the selected types from quiz, flashcard, and puzzle, and SHALL NOT include any interactive elements of unselected types in the resulting CourseData sections
3. WHEN a user specifies questions per section (between 1 and 10 inclusive), THE CourseGenerator SHALL request that number of quiz questions from the LLM for each section and include all returned questions up to the requested count in the output
4. IF a user attempts to begin generation with no interactive type selected, THEN THE CourseGenerator SHALL prevent generation from starting and display an error message indicating that at least one interactive type must be selected
5. IF the LLM returns fewer quiz questions than the requested questionsPerSection count, THEN THE CourseGenerator SHALL include all returned questions without failing and proceed with course assembly

### Requirement 8: Application Routing and Navigation

**User Story:** As a user, I want to navigate between the landing page and the application pages, so that I can access course creation and viewing functionality.

#### Acceptance Criteria

1. THE Application SHALL serve the existing landing page at the root path (/)
2. THE Application SHALL provide a course creation page at the path /app/create
3. THE Application SHALL provide a course viewer page at the path /app/course/:id
4. THE Application SHALL provide a saved courses dashboard at the path /app/courses
5. WHEN a user navigates to a course viewer path with a course ID that exists in IndexedDB, THE Application SHALL load and display the corresponding course without a full page reload
6. IF a user navigates to a course viewer path with a course ID that does not exist in IndexedDB, THEN THE Application SHALL display an error message indicating the course was not found and provide a navigation link back to the saved courses dashboard
7. IF a user navigates to a path that does not match any defined route, THEN THE Application SHALL display a not-found page and provide a navigation link back to the root path (/)

### Requirement 9: Error Recovery and Resilience

**User Story:** As a learner, I want the system to handle errors gracefully and recover when possible, so that I do not lose progress due to failures.

#### Acceptance Criteria

1. IF a network failure occurs during course generation, THEN THE CourseGenerator SHALL save all successfully generated sections to IndexedDB as partial progress and display a retry option to the user within 3 seconds of detecting the failure
2. WHEN a user retries after a network failure, THE CourseGenerator SHALL resume generation from the first incomplete section, preserving all previously saved sections, rather than restarting from the beginning
3. IF the LLM returns a response that is not valid JSON, THEN THE CourseGenerator SHALL attempt to extract JSON from the response by stripping markdown fencing and trailing text, and if extraction fails, fall back to local heuristic-based generation for that section
4. WHEN an input validation error occurs, THE VideoManager SHALL display an error message identifying which field failed validation and what input formats or constraints are accepted
5. IF a network failure occurs during course generation and the retry is attempted a maximum of 3 times without success, THEN THE CourseGenerator SHALL stop retrying, preserve any partial progress saved to IndexedDB, and display a message indicating generation cannot continue
6. IF saving partial progress to IndexedDB fails, THEN THE CourseGenerator SHALL notify the user that progress could not be saved and offer the option to retry saving or to copy the generated course data to the clipboard
7. WHEN a recoverable error occurs during course generation, THE CourseGenerator SHALL display an indication of which section failed and how many sections completed successfully out of the total expected

### Requirement 10: Security and Input Sanitization

**User Story:** As a user, I want my inputs and generated content to be handled securely, so that the application does not expose me to cross-site scripting or other security risks.

#### Acceptance Criteria

1. WHEN processing a user-provided URL, THE VideoManager SHALL reject any URL that uses a scheme other than https or http, contains embedded script content (e.g., javascript: or data: schemes), or exceeds 2048 characters in length, and SHALL display an error message indicating the URL was rejected for security reasons
2. WHEN rendering LLM-generated content (quiz text, flashcard text, explanations), THE Application SHALL render all such content as plain text (not raw HTML) so that any HTML tags or entities in the content are displayed as literal text rather than interpreted as markup
3. THE Application SHALL store all course data exclusively in the user's browser via IndexedDB and SHALL NOT transmit stored course data to any server, with the exception of outbound requests to the configured free-tier LLM APIs (Hugging Face, Groq) during course generation
4. THE Application SHALL validate URL inputs against allowlist regex patterns that match only YouTube, Vimeo, and direct video link domains and paths, and SHALL reject any URL not matching these patterns before further processing
5. IF a user-provided URL contains HTML tags or encoded script sequences (such as %3Cscript%3E), THEN THE VideoManager SHALL strip or reject these characters and SHALL NOT pass unsanitized URL content into DOM rendering or navigation functions
