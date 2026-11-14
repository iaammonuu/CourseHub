import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const activeCharts = new Map<string, Chart>();

function destroyExistingChart(canvasId: string): void {
  const prev = activeCharts.get(canvasId);
  if (prev) {
    prev.destroy();
    activeCharts.delete(canvasId);
  }
}

export interface AdminChartsPayload {
  courseWiseEnrollment: Array<{
    courseCode: string;
    title: string;
    enrolled: number;
    available: number;
    totalSeats: number;
  }>;
  seatsFilledVsAvailable: {
    occupied: number;
    available: number;
    total: number;
  };
  departmentWiseEnrollment: Array<{
    department: string;
    enrollments: number;
    courses: number;
    students: number;
  }>;
  activeVsDropped: {
    active: number;
    dropped: number;
    waitlisted: number;
  };
  coursePopularity: Array<{
    courseCode: string;
    title: string;
    fillRate: number;
    enrolled: number;
    waitlistCount: number;
  }>;
}

/**
 * Renders all 5 required Chart.js charts on the Admin Analytics Dashboard
 */
export function renderAdminAnalyticsCharts(chartsData: AdminChartsPayload): void {
  const fontConfig = {
    family: "'Plus Jakarta Sans', sans-serif",
    size: 11,
  };

  // 1. Course-wise enrollment bar chart
  const c1 = document.getElementById('chart-course-enrollment') as HTMLCanvasElement | null;
  if (c1) {
    destroyExistingChart('chart-course-enrollment');
    const chart1 = new Chart(c1, {
      type: 'bar',
      data: {
        labels: chartsData.courseWiseEnrollment.map((c) => c.courseCode),
        datasets: [
          {
            label: 'Enrolled Seats',
            data: chartsData.courseWiseEnrollment.map((c) => c.enrolled),
            backgroundColor: '#2563EB',
            borderRadius: 5,
          },
          {
            label: 'Available Seats',
            data: chartsData.courseWiseEnrollment.map((c) => c.available),
            backgroundColor: '#CBD5E1',
            borderRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: fontConfig } },
        },
        scales: {
          x: { ticks: { font: fontConfig } },
          y: { beginAtZero: true, ticks: { precision: 0, font: fontConfig } },
        },
      },
    });
    activeCharts.set('chart-course-enrollment', chart1);
  }

  // 2. Seats filled vs available doughnut chart
  const c2 = document.getElementById('chart-seats-ratio') as HTMLCanvasElement | null;
  if (c2) {
    destroyExistingChart('chart-seats-ratio');
    const chart2 = new Chart(c2, {
      type: 'doughnut',
      data: {
        labels: ['Seats Filled (Occupied)', 'Seats Available'],
        datasets: [
          {
            data: [
              chartsData.seatsFilledVsAvailable.occupied,
              chartsData.seatsFilledVsAvailable.available,
            ],
            backgroundColor: ['#2563EB', '#16A34A'],
            borderWidth: 2,
            borderColor: '#FFFFFF',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: {
          legend: { position: 'bottom', labels: { font: fontConfig } },
        },
      },
    });
    activeCharts.set('chart-seats-ratio', chart2);
  }

  // 3. Department-wise enrollment chart
  const c3 = document.getElementById('chart-department-enrollment') as HTMLCanvasElement | null;
  if (c3) {
    destroyExistingChart('chart-department-enrollment');
    const chart3 = new Chart(c3, {
      type: 'bar',
      data: {
        labels: chartsData.departmentWiseEnrollment.map((d) => d.department),
        datasets: [
          {
            label: 'Active Course Enrollments',
            data: chartsData.departmentWiseEnrollment.map((d) => d.enrollments),
            backgroundColor: ['#2563EB', '#0284C7', '#0D9488', '#4F46E5', '#D97706'],
            borderRadius: 5,
          },
          {
            label: 'Registered Students',
            data: chartsData.departmentWiseEnrollment.map((d) => d.students),
            backgroundColor: '#94A3B8',
            borderRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: fontConfig } },
        },
        scales: {
          x: { ticks: { font: fontConfig } },
          y: { beginAtZero: true, ticks: { precision: 0, font: fontConfig } },
        },
      },
    });
    activeCharts.set('chart-department-enrollment', chart3);
  }

  // 4. Active vs Dropped enrollment chart
  const c4 = document.getElementById('chart-active-dropped') as HTMLCanvasElement | null;
  if (c4) {
    destroyExistingChart('chart-active-dropped');
    const chart4 = new Chart(c4, {
      type: 'pie',
      data: {
        labels: ['Active Enrollments', 'Dropped Enrollments', 'Waitlisted Requests'],
        datasets: [
          {
            data: [
              chartsData.activeVsDropped.active,
              chartsData.activeVsDropped.dropped,
              chartsData.activeVsDropped.waitlisted,
            ],
            backgroundColor: ['#16A34A', '#DC2626', '#D97706'],
            borderWidth: 2,
            borderColor: '#FFFFFF',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: fontConfig } },
        },
      },
    });
    activeCharts.set('chart-active-dropped', chart4);
  }

  // 5. Course popularity horizontal bar chart (Fill Rate %)
  const c5 = document.getElementById('chart-course-popularity') as HTMLCanvasElement | null;
  if (c5) {
    destroyExistingChart('chart-course-popularity');
    const topCourses = chartsData.coursePopularity.slice(0, 8);
    const chart5 = new Chart(c5, {
      type: 'bar',
      data: {
        labels: topCourses.map((c) => `${c.courseCode} (${c.fillRate}%)`),
        datasets: [
          {
            label: 'Seat Utilization %',
            data: topCourses.map((c) => c.fillRate),
            backgroundColor: topCourses.map((c) =>
              c.fillRate >= 100 ? '#DC2626' : c.fillRate >= 25 ? '#2563EB' : '#16A34A'
            ),
            borderRadius: 5,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: (v) => `${v}%`, font: fontConfig },
          },
          y: { ticks: { font: fontConfig } },
        },
      },
    });
    activeCharts.set('chart-course-popularity', chart5);
  }
}
