# Implementation Plan: Video-to-Course (Clip2Course Core)

## Overview

Transform Clip2Course from a static landing page into a full client-side application that converts video content into interactive learning courses. The implementation adds React Router for navigation, builds five core service modules (VideoManager, TranscriptExtractor, CourseGenerator, CourseStore, LLMProvider), creates three app pages (Create, Viewer, Dashboard), and wires everything together with IndexedDB persistence and free-tier LLM integration.

## Tasks

- [x] 1. Set up project structure, routing, and shared types
  - [x] 1.1 Install runtime and dev dependencies
    - Install `react-router-dom`, `idb`, `youtube-transcript`
    - Install dev deps: `vitest`, `fast-check`, `msw`, `@testing-library/react`, `jsdom`
    - Configure vitest in `vite.config.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 1.2 Create TypeScript interfaces and type definitions
    - Create `src/types/course.ts` with all interfaces: VideoInput, VideoMetadata, TranscriptSegment, TranscriptResult, QuizQuestion, Flashcard, Puzzle, PuzzleItem, CourseSection, CourseData, CourseProgress, CourseSummary, CourseGeneratorOptions, LLMOptions, QuotaInfo, ValidationResult
    - _Requirements: 1.1, 1.4, 4.3, 4.4, 6.1, 7.1_

  - [x] 1.3 Set up React Router and application shell
    - Wrap App in BrowserRouter, define routes: `/` (landing), `/app/create`, `/app/course/:id`, `/app/courses`
    - Create placeholder page components: `src/pages/CreateCourse.tsx`, `src/pages/CourseViewer.tsx`, `src/pages/Dashboard.tsx`
    - Add 404 not-found page with navigation link back to root
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_

- [x] 2. Implement VideoManager service
  - [x] 2.1 Implement input validation logic
    - Create `src/services/videoManager.ts`
    - Implement `validateInput()` for file type, size (≤500MB, ≥1KB), URL format (YouTube, Vimeo, direct video links)
    - Implement URL security checks: reject non-http/https schemes, javascript:/data: schemes, URLs > 2048 chars, embedded script content
    - Implement allowlist regex for YouTube, Vimeo, and direct video domains
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1, 10.4, 10.5_

  - [ ]* 2.2 Write property test for input validation
    - **Property 1: Input Validation Correctness**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

  - [x] 2.3 Implement audio extraction and metadata retrieval
    - Implement `extractAudio()` using Web Audio API to decode video and produce audio blob
    - Implement `getMetadata()` to retrieve title, duration, and source type
    - Handle error cases: no audio track, decode failure
    - _Requirements: 1.6, 1.7, 3.1, 3.2_

  - [ ]* 2.4 Write unit tests for VideoManager
    - Test valid/invalid file types, size boundaries, URL patterns
    - Test URL security rejection (javascript:, data:, oversized URLs, script sequences)
    - Test metadata extraction error handling
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1, 10.4, 10.5_

- [x] 3. Implement TranscriptExtractor service
  - [x] 3.1 Implement YouTube transcript extraction
    - Create `src/services/transcriptExtractor.ts`
    - Implement `parseYouTubeVideoId()` supporting watch, short-link, embed, and shorts URL formats
    - Implement `extractFromYouTube()` with fallback across at least 3 free transcript sources (youtube-transcript npm, Invidious API, Cobalt API)
    - Produce TranscriptResult with segments ordered by startTime, confidence 0.95
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 3.2 Write property test for YouTube ID parsing
    - **Property 9: YouTube ID Format**
    - **Validates: Requirements 2.1**

  - [x] 3.3 Implement browser-based audio transcription
    - Implement `extractFromAudio()` using Web Speech API (SpeechRecognition)
    - Split audio into 30-second chunks, transcribe each independently
    - Skip chunks producing no text, produce TranscriptResult with confidence 0.7
    - Handle browser incompatibility (show warning for unsupported browsers)
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 3.4 Write property test for audio chunking
    - **Property 16: Audio Chunking Correctness**
    - **Validates: Requirements 3.2**

  - [ ]* 3.5 Write unit tests for TranscriptExtractor
    - Test parseYouTubeVideoId with all URL format variations
    - Test transcript segment ordering
    - Test fallback behavior when sources fail
    - Test empty transcript error handling
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement LLMProvider service
  - [x] 5.1 Implement LLM provider abstraction and fallback chain
    - Create `src/services/llmProvider.ts`
    - Implement HuggingFaceProvider with free-tier Inference API
    - Implement GroqProvider with free-tier API
    - Implement LLMProviderChain with ordered fallback, 15-second timeout, rate-limit tracking
    - Implement in-memory LRU cache (max 50 entries) for response caching
    - Implement local heuristic fallback generation when all providers fail
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 5.2 Write property test for provider chain never throws
    - **Property 8: Provider Chain Never Throws**
    - **Validates: Requirements 5.3, 5.4**

  - [ ]* 5.3 Write property test for LLM response caching
    - **Property 12: LLM Response Caching Idempotence**
    - **Validates: Requirements 5.5**

  - [ ]* 5.4 Write property test for provider skip on unavailability
    - **Property 17: Provider Skip on Unavailability**
    - **Validates: Requirements 5.2**

  - [ ]* 5.5 Write unit tests for LLMProvider
    - Test fallback order when primary fails
    - Test rate limit detection and pause behavior
    - Test cache hit/miss scenarios and LRU eviction
    - Test local heuristic produces valid output
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

- [x] 6. Implement CourseGenerator service
  - [x] 6.1 Implement transcript section splitting
    - Create `src/services/courseGenerator.ts`
    - Implement `splitIntoSections()` with 180-second target duration
    - Merge remainder of fewer than 3 segments into preceding section
    - Ensure no data loss (all segments appear in exactly one section)
    - _Requirements: 4.1, 4.2_

  - [ ]* 6.2 Write property test for section splitting no data loss
    - **Property 5: No Data Loss in Section Splitting**
    - **Validates: Requirements 4.2**

  - [ ]* 6.3 Write property test for section timestamp ordering
    - **Property 4: Section Timestamps Are Ordered**
    - **Validates: Requirements 4.5**

  - [x] 6.4 Implement course content generation
    - Implement `buildCoursePrompt()` to craft prompts from section text and options
    - Implement `parseLLMResponse()` to parse JSON from LLM, strip markdown fencing, handle malformed responses
    - Implement `generateSectionContent()` using LLMProviderChain with fallback to local heuristic
    - Filter interactive types based on CourseGeneratorOptions.interactiveTypes
    - _Requirements: 4.3, 4.4, 4.5, 4.8, 7.1, 7.2, 7.3, 7.5, 9.3_

  - [ ]* 6.5 Write property test for quiz answers validity
    - **Property 3: Quiz Answers Are Valid Options**
    - **Validates: Requirements 4.4**

  - [ ]* 6.6 Write property test for content type filtering
    - **Property 13: Content Type Filtering**
    - **Validates: Requirements 7.2, 7.4**

  - [ ]* 6.7 Write property test for malformed LLM response resilience
    - **Property 15: Malformed LLM Response Resilience**
    - **Validates: Requirements 9.3**

  - [x] 6.8 Implement full course assembly and pipeline
    - Implement `processVideoToCourse()` orchestrating: validate → metadata → transcript → split → generate → assemble → save
    - Compute `totalQuestions` as sum of all section quizzes
    - Compute `estimatedTime` using formula: (totalQuestions × 1.5) + (sections.length × 2)
    - Implement error recovery: save partial progress on failure, support resume from incomplete section
    - Validate at least one interactive type is selected before generation
    - _Requirements: 4.6, 4.7, 4.9, 7.4, 9.1, 9.2, 9.5, 9.7_

  - [ ]* 6.9 Write property tests for course assembly
    - **Property 2: Course Sections Contain Interactive Content**
    - **Property 10: Total Questions Computed Correctly**
    - **Property 11: Estimated Time Formula**
    - **Validates: Requirements 4.3, 4.6, 4.7**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement CourseStore service
  - [x] 8.1 Implement IndexedDB persistence layer
    - Create `src/services/courseStore.ts` using `idb` library
    - Implement `saveCourse()`, `getCourse()`, `listCourses()`, `deleteCourse()`
    - Implement `updateProgress()` for tracking completed sections and quiz scores
    - Return null for non-existent course IDs without throwing
    - Handle storage quota errors gracefully (notify user, don't corrupt data)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 8.2 Write property test for storage round-trip integrity
    - **Property 7: Storage Round-Trip Integrity**
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 8.3 Write unit tests for CourseStore
    - Test save/retrieve deep equality
    - Test list ordering by lastAccessedAt descending
    - Test delete removes course and progress data
    - Test progress update persistence
    - Test null return for non-existent IDs
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 9. Implement UI pages and components
  - [x] 9.1 Implement VideoInputForm component
    - Create `src/components/VideoInputForm.tsx`
    - URL input with paste support, file upload with drag-and-drop
    - Real-time validation feedback (file type, size, URL format errors)
    - Course generation options: difficulty selector, interactive type checkboxes, questions per section slider (1-10)
    - Prevent submission with no interactive type selected
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 7.3, 7.4, 9.4_

  - [x] 9.2 Implement CreateCourse page
    - Create `src/pages/CreateCourse.tsx`
    - Wire VideoInputForm to processVideoToCourse pipeline
    - Show progress indicator during generation (section completion count)
    - Display errors with retry option on network failure
    - Handle partial progress recovery and clipboard export on save failure
    - _Requirements: 9.1, 9.2, 9.5, 9.6, 9.7_

  - [x] 9.3 Implement interactive course components
    - Create `src/components/QuizCard.tsx` for quiz interaction (select answer, show result/explanation)
    - Create `src/components/FlashcardDeck.tsx` for flashcard flip interaction
    - Create `src/components/PuzzleBoard.tsx` for matching, ordering, and word-scramble puzzles
    - Create `src/components/CourseSection.tsx` for section display with summary and interactive elements
    - Render all LLM-generated content as plain text (escape HTML)
    - _Requirements: 4.3, 4.4, 10.2_

  - [x] 9.4 Implement CourseViewer page
    - Create `src/pages/CourseViewer.tsx`
    - Load course from IndexedDB by route param `:id`
    - Display sections with interactive elements, track progress
    - Update CourseProgress on section/quiz completion
    - Show error with link to dashboard if course not found
    - _Requirements: 8.5, 8.6, 6.2, 6.6_

  - [x] 9.5 Implement Dashboard page
    - Create `src/pages/Dashboard.tsx`
    - List saved courses ordered by lastAccessedAt descending
    - Show summary: title, section count, completed sections, quiz scores, creation date
    - Support course deletion with confirmation
    - _Requirements: 6.4, 6.5, 8.4_

  - [ ]* 9.6 Write property test for HTML sanitization
    - **Property 14: HTML Sanitization**
    - **Validates: Requirements 10.1, 10.2**

- [x] 10. Integration wiring and final assembly
  - [x] 10.1 Wire all services and pages together
    - Connect VideoInputForm → VideoManager → TranscriptExtractor → CourseGenerator → CourseStore
    - Ensure routing works end-to-end: landing → create → viewer → dashboard
    - Configure environment variables for LLM API keys (VITE_HF_API_KEY, VITE_GROQ_API_KEY)
    - Add navigation links between app pages and from landing page
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 10.3_

  - [ ]* 10.2 Write integration tests for end-to-end flows
    - Test YouTube URL → transcript → course pipeline with mocked API responses
    - Test file upload → audio extraction → transcript pipeline with fixture data
    - Test IndexedDB persistence: save → retrieve → verify equality
    - Test LLM fallback chain with simulated provider failures
    - Test course not found navigation behavior
    - _Requirements: 2.3, 4.1, 5.1, 6.1, 8.5, 8.6_

  - [ ]* 10.3 Write property test for transcript ordering
    - **Property 6: Transcript Ordering**
    - **Validates: Requirements 2.5, 3.4**

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing landing page at `/` remains unchanged; new functionality is added under `/app/*` routes
- Free-tier LLM API keys are client-side exposed but rate-limited; this is acceptable per the design's security model
- Test framework: Vitest + fast-check for property-based testing + MSW for API mocking

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "3.1", "3.3"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.2", "3.4", "3.5"] },
    { "id": 4, "tasks": ["2.4", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "5.5", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 7, "tasks": ["6.5", "6.6", "6.7", "6.8"] },
    { "id": 8, "tasks": ["6.9", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 10, "tasks": ["9.2", "9.3", "9.5"] },
    { "id": 11, "tasks": ["9.4", "9.6"] },
    { "id": 12, "tasks": ["10.1"] },
    { "id": 13, "tasks": ["10.2", "10.3"] }
  ]
}
```
