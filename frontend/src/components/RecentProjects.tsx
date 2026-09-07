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
}

interface RecentProjectsProps {
  onSelectProject: (project: ProjectItem) => void;
  onViewAll?: () => void;
}

export const RECENT_PROJECTS: ProjectItem[] = [
  {
    id: "mumbai-infra",
    title: "Coastal Infrastructure Mapping",
    location: "Mumbai, India",
    date: "Aug 28, 2024",
    status: "Completed",
    image: "/images/exact_proj_mumbai.jpg",
    coordinates: { lon: 72.95, lat: 18.95, height: 14000 },
    sampleQuery: "Detect all vessels and container cranes in Mumbai JNPT maritime port",
  },
  {
    id: "california-wildfire",
    title: "Wildfire Impact Assessment",
    location: "California, USA",
    date: "Aug 24, 2024",
    status: "In Progress",
    image: "/images/exact_proj_wildfire.jpg",
    coordinates: { lon: -120.45, lat: 37.62, height: 28000 },
    sampleQuery: "Analyze wildfire smoke plume extent and estimate burn scar area",
  },
  {
    id: "punjab-agriculture",
    title: "Crop Health Analysis",
    location: "Punjab, India",
    date: "Aug 20, 2024",
    status: "Completed",
    image: "/images/exact_proj_crops.jpg",
    coordinates: { lon: 75.83, lat: 30.78, height: 16000 },
    sampleQuery: "Calculate NDVI spectral crop vigor index and classify healthy vegetation parcels",
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
