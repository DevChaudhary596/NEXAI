"use client";

import React from "react";
import { ArrowRight, MapPin, Calendar, MoreVertical } from "lucide-react";

export interface ProjectItem {
  id: string;
  title: string;
  location: string;
  date: string;
  status: "Completed" | "In Progress";
  image: string;
  coordinates: { lon: number; lat: number; height: number };
  sampleQuery: string;
  sceneId?: string;
  bounds?: number[];
}

interface RecentProjectsProps {
  onSelectProject: (project: ProjectItem) => void;
  onViewAll?: () => void;
}

export const RECENT_PROJECTS: ProjectItem[] = [
  {
    id: "sfo-aviation",
    title: "Aviation Fleet Distribution",
    location: "SFO Airport, California",
    date: "Sep 03, 2026",
    status: "Completed",
    image: "/images/metric_plane_hd.jpg",
    coordinates: { lon: -122.370, lat: 37.615, height: 3500 },
    sceneId: "043267413b48_20260903T034939",
    bounds: [-122.375, 37.60776, -122.36476, 37.618],
    sampleQuery: "Detect and count all commercial planes and aircraft at SFO runway corridor.",
  },
  {
    id: "singapore-port",
    title: "Maritime Vessel Traffic & Corridors",
    location: "Singapore Harbor",
    date: "Sep 03, 2026",
    status: "Completed",
    image: "/images/exact_proj_mumbai.jpg",
    coordinates: { lon: 103.776, lat: 1.278, height: 6000 },
    sceneId: "023e8117a308_20260903T054525",
    bounds: [103.7501, 1.2549, 103.8019, 1.3013],
    sampleQuery: "Detect and classify maritime vessels, cargo ships, and container traffic.",
  },
  {
    id: "punjab-agriculture",
    title: "Crop Health Analysis & NDVI",
    location: "Punjab, India",
    date: "Sep 03, 2026",
    status: "Completed",
    image: "/images/exact_proj_crops.jpg",
    coordinates: { lon: 75.840, lat: 30.789, height: 12000 },
    sceneId: "d1f2e30941c2_20260903T094411",
    bounds: [75.79326, 30.74317, 75.88644, 30.83553],
    sampleQuery: "Compute NDVI vegetation index and map healthy cropland zones in square kilometers.",
  },
];

export default function RecentProjects({ onSelectProject, onViewAll }: RecentProjectsProps) {
  return (
    <div className="theme-recent-projects">
      {/* Header */}
      <div className="theme-recent-projects__header">
        <h3 className="theme-recent-projects__title">Recent Projects</h3>
        <button onClick={onViewAll} className="theme-recent-projects__view-all">
          <span>View All</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* Cards List */}
      <div className="theme-recent-projects__grid">
        {RECENT_PROJECTS.map((project) => (
          <div
            key={project.id}
            onClick={() => onSelectProject(project)}
            className="theme-project-card"
            title={`Fly to ${project.location} and inspect`}
          >
            {/* Thumbnail with status badge */}
            <div className="theme-project-card__thumb">
              <img src={project.image} alt={project.title} className="theme-project-card__img" />
              <div
                className={`theme-project-card__badge ${
                  project.status === "Completed"
                    ? "theme-project-card__badge--completed"
                    : "theme-project-card__badge--progress"
                }`}
              >
                <span className="theme-project-card__dot" />
                <span>{project.status}</span>
              </div>
            </div>

            {/* Info */}
            <div className="theme-project-card__info">
              <div className="theme-project-card__top">
                <h4 className="theme-project-card__heading">{project.title}</h4>
                <button
                  className="theme-project-card__more"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <MoreVertical size={14} />
                </button>
              </div>

              <div className="theme-project-card__meta">
                <span className="theme-project-card__meta-item">
                  <MapPin size={11} className="theme-project-card__meta-icon" />
                  <span>{project.location}</span>
                </span>
                <span className="theme-project-card__meta-item">
                  <Calendar size={11} className="theme-project-card__meta-icon" />
                  <span>{project.date}</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
