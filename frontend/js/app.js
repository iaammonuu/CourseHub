/**
 * CourseHub Vanilla JavaScript Entry Bridge
 * Re-exports and bootstraps the CourseHub client application engine.
 */
import { bootstrapCourseHubApp } from '../../src/coursehubApp';

document.addEventListener('DOMContentLoaded', () => {
  bootstrapCourseHubApp();
});
