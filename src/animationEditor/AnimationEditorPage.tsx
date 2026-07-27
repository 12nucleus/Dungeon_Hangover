import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimationScene } from './AnimationEditorScene';
import { Timeline } from './Timeline';
import { JointPanel } from './JointPanel';
import { CharacterSelector } from './CharacterSelector';
import type { AnimClip, AnimProject, JointEuler, ModelPreset } from './animationTypes';
import {
  blankPose, clonePose, defaultProject, MODEL_PRESETS,
  poseToCodeSnippet, clipToCodeModule, clipToUpdateRigSnippet,
  projectToJSON, projectFromJSON, copyToClipboard,
  newClip,
} from './animationUtils';
import { GAME_PRESETS } from './gamePresets';

export function AnimationEditorPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<AnimationScene | null>(null);
  const [project, setProject] = useState<AnimProject>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('animEditor_project') : null;
    if (saved) {
      const p = projectFromJSON(saved);
      if (p) return p;
    }
    return defaultProject();
  });
  const [activeClipIdx, setActiveClipIdx] = useState(0);
  const [selectedKfIdx, setSelectedKfIdx] = useState(0);
  const [playTime, setPlayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [jointValues, setJointValues] = useState<Record<string, JointEuler>>(blankPose());
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [jsonLoaded, setJsonLoaded] = useState('');
  const [mugOn, setMugOn] = useState(false);
  const [poseMenuOpen, setPoseMenuOpen] = useState(false);

  const activeClip = project.clips[activeClipIdx] ?? null;

  const buildScene = useCallback(() => {
    if (!hostRef.current) return;
    if (sceneRef.current) sceneRef.current.dispose();
    const s = new AnimationScene(hostRef.current);
    sceneRef.current = s;
    const preset = MODEL_PRESETS.find((m) => m.id === project.modelType) ?? MODEL_PRESETS[0];
    s.buildCharacter(preset.scheme, preset.weapon);
    if (mugOn) s.setMugEnabled(true);
    if (activeClip) s.setClip(activeClip);
    s.onTick(() => {
      setPlayTime(s.playTime);
      if (s.isPlaying) setJointValues(s.jointValues);
    });
  }, [project.modelType, activeClip, mugOn]);

  useEffect(() => {
    buildScene();
    return () => { sceneRef.current?.dispose(); sceneRef.current = null; };
  }, [buildScene]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setClip(activeClip);
  }, [activeClip]);

  const setActiveClip = useCallback((idx: number) => {
    setActiveClipIdx(idx);
    setSelectedKfIdx(0);
    setIsPlaying(false);
    setPlayTime(0);
    if (sceneRef.current) sceneRef.current.stop();
  }, []);

  const updateClip = useCallback((updater: (clip: AnimClip) => AnimClip) => {
    setProject((prev) => {
      const clips = prev.clips.map((c, i) => i === activeClipIdx ? updater(c) : c);
      return { ...prev, clips };
    });
  }, [activeClipIdx]);

  const addKeyframe = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;
    const joints = clonePose(s.jointValues as any);
    updateClip((clip) => {
      const t = Math.min(clip.duration, s.playTime);
      const kfs = [...clip.keyframes, { time: t, joints }];
      kfs.sort((a, b) => a.time - b.time);
      return { ...clip, keyframes: kfs };
    });
  }, [updateClip]);

  const deleteKeyframe = useCallback((idx: number) => {
    updateClip((clip) => {
      if (clip.keyframes.length <= 1) return clip;
      return { ...clip, keyframes: clip.keyframes.filter((_, i) => i !== idx) };
    });
    setSelectedKfIdx((prev) => Math.max(0, prev - 1));
  }, [updateClip]);

  const selectKeyframe = useCallback((idx: number) => {
    setSelectedKfIdx(idx);
    if (sceneRef.current) {
      sceneRef.current.stop();
      setIsPlaying(false);
      const kf = activeClip?.keyframes[idx];
      if (kf) {
        sceneRef.current.playTime = kf.time;
        setPlayTime(kf.time);
        sceneRef.current.applyPose(kf.joints);
        setJointValues(kf.joints);
      }
    }
  }, [activeClip]);

  const setJointAxis = useCallback((joint: string, axis: 'x' | 'y' | 'z', value: number) => {
    setJointValues((prev) => ({
      ...prev,
      [joint]: { ...(prev[joint] ?? { x: 0, y: 0, z: 0 }), [axis]: value },
    }));
    if (sceneRef.current) {
      sceneRef.current.setJointEuler(joint, {
        ...(sceneRef.current.jointValues[joint] ?? { x: 0, y: 0, z: 0 }),
        [axis]: value,
      });
    }
  }, []);

  const handlePlay = useCallback(() => {
    if (!sceneRef.current) return;
    if (isPlaying) {
      sceneRef.current.pause();
      setIsPlaying(false);
    } else {
      if (sceneRef.current.playTime >= (activeClip?.duration ?? 1) - 0.01) {
        sceneRef.current.playTime = 0;
        setPlayTime(0);
      }
      sceneRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, activeClip]);

  const handleStop = useCallback(() => {
    if (!sceneRef.current) return;
    sceneRef.current.stop();
    setIsPlaying(false);
    setPlayTime(0);
  }, []);

  const handleScrub = useCallback((t: number) => {
    if (!sceneRef.current) return;
    sceneRef.current.stop();
    setIsPlaying(false);
    sceneRef.current.playTime = t;
    setPlayTime(t);
    if (activeClip) {
      const found = activeClip.keyframes.findIndex((k, i) => {
        const next = activeClip.keyframes[i + 1];
        return k.time <= t && (!next || next.time > t);
      });
      if (found >= 0) {
        setSelectedKfIdx(found);
        setJointValues(clonePose(activeClip.keyframes[found].joints));
      }
    }
  }, [activeClip]);

  const handleMoveKeyframe = useCallback((idx: number, newTime: number) => {
    updateClip((clip) => {
      const kfs = clip.keyframes.map((k, i) => i === idx ? { ...k, time: parseFloat(newTime.toFixed(2)) } : k);
      kfs.sort((a, b) => a.time - b.time);
      const newIdx = kfs.findIndex(
        (k) => k.time === parseFloat(newTime.toFixed(2)) && k.joints === clip.keyframes[idx].joints,
      );
      if (newIdx >= 0) setSelectedKfIdx(newIdx);
      return { ...clip, keyframes: kfs };
    });
  }, [updateClip]);

  const handleSelectModel = useCallback((preset: ModelPreset) => {
    setProject((prev) => ({
      ...prev,
      modelType: preset.id,
      modelConfig: preset.scheme,
      weapon: preset.weapon,
    }));
  }, []);

  const handleToggleMug = useCallback(() => {
    setMugOn((prev) => {
      const next = !prev;
      if (sceneRef.current) sceneRef.current.setMugEnabled(next);
      return next;
    });
  }, []);

  // Load a game pose (sit / drink / idle / ...) as a new clip so the user can
  // edit it as a starting point. The pose is a single keyframe at t=0.
  const handleLoadGamePose = useCallback((preset: AnimClip) => {
    setPoseMenuOpen(false);
    // Build the clip up-front so we can snap the rig to it immediately.
    const clip: AnimClip = {
      name: preset.name,
      duration: preset.duration,
      loop: preset.loop,
      keyframes: preset.keyframes.map((k) => ({ time: k.time, joints: clonePose(k.joints) })),
    };
    let targetIdx = -1;
    setProject((prev) => {
      const existingIdx = prev.clips.findIndex((c) => c.name === preset.name);
      if (existingIdx >= 0) {
        targetIdx = existingIdx;
        return { ...prev, clips: prev.clips.map((c, i) => i === existingIdx ? clip : c) };
      }
      targetIdx = prev.clips.length;
      return { ...prev, clips: [...prev.clips, clip] };
    });
    // Select the clip and snap the rig to its first keyframe (after state flush).
    setTimeout(() => {
      if (targetIdx < 0) return;
      setActiveClipIdx(targetIdx);
      setSelectedKfIdx(0);
      setIsPlaying(false);
      setPlayTime(0);
      if (sceneRef.current) {
        sceneRef.current.stop();
        sceneRef.current.applyPose(clip.keyframes[0].joints);
        setJointValues(clonePose(clip.keyframes[0].joints));
      }
    }, 0);
  }, []);

  const handleExportJSON = useCallback(() => {
    const json = projectToJSON(project);
    copyToClipboard(json);
    setCopied('json');
    setTimeout(() => setCopied(''), 1500);
  }, [project]);

  const handleExportSnippet = useCallback(() => {
    const clip = activeClip;
    if (!clip || clip.keyframes.length === 0) return;
    const joints = clip.keyframes[clip.keyframes.length - 1].joints;
    const snippet = poseToCodeSnippet(clip.name, joints);
    copyToClipboard(snippet);
    setCopied('snippet');
    setTimeout(() => setCopied(''), 1500);
    console.log('[Anim Editor static snippet]\n' + snippet);
  }, [activeClip]);

  const handleExportModule = useCallback(() => {
    const clip = activeClip;
    if (!clip || clip.keyframes.length === 0) return;
    const code = clipToCodeModule(clip);
    copyToClipboard(code);
    setCopied('module');
    setTimeout(() => setCopied(''), 1500);
    console.log('[Anim Editor runtime module]\n' + code);
  }, [activeClip]);

  const handleExportRigSnippet = useCallback(() => {
    const clip = activeClip;
    if (!clip || clip.keyframes.length === 0) return;
    const code = clipToUpdateRigSnippet(clip);
    copyToClipboard(code);
    setCopied('rig');
    setTimeout(() => setCopied(''), 1500);
    console.log('[Anim Editor updateRig snippet]\n' + code);
  }, [activeClip]);

  const handleLoadJSON = useCallback(() => {
    const json = window.prompt('Paste project JSON:');
    if (!json) return;
    const p = projectFromJSON(json);
    if (!p) { alert('Invalid project JSON'); return; }
    setProject(p);
    setActiveClipIdx(0);
    setSelectedKfIdx(0);
    setIsPlaying(false);
    setPlayTime(0);
    setJsonLoaded('OK!');
    setTimeout(() => setJsonLoaded(''), 1500);
  }, []);

  const handleAddClip = useCallback(() => {
    const name = window.prompt('New clip name (mode key for updateRig):', 'myAnim');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    setProject((prev) => {
      if (prev.clips.some((c) => c.name === trimmed)) {
        alert(`Clip "${trimmed}" already exists`);
        return prev;
      }
      return { ...prev, clips: [...prev.clips, newClip(trimmed, false)] };
    });
    setActiveClipIdx(project.clips.length);
  }, [project.clips.length]);

  const handleDeleteClip = useCallback(() => {
    if (project.clips.length <= 1) return;
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.filter((_, i) => i !== activeClipIdx),
    }));
    setActiveClipIdx((prev) => Math.max(0, prev - 1));
  }, [activeClipIdx, project.clips.length]);

  const handleNewProject = useCallback(() => {
    if (project.clips.length > 1 && !window.confirm('Discard current project?')) return;
    setProject(defaultProject());
    setActiveClipIdx(0);
    setSelectedKfIdx(0);
    setIsPlaying(false);
    setPlayTime(0);
  }, [project.clips.length]);

  useEffect(() => {
    const id = setInterval(() => setGrabbed(null), 120);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: '#14110d', color: '#e8e2d6',
      fontFamily: 'ui-monospace, monospace', fontSize: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        background: '#1a1612', borderBottom: '1px solid #443', flexShrink: 0,
        height: 36,
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#ffd98a', marginRight: 4 }}>
          Animation Editor
        </span>
        <button onClick={handlePlay}
          style={{
            padding: '4px 10px', background: isPlaying ? '#5a8a3a' : '#3a6a3a', color: '#ddd',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button onClick={handleStop}
          style={{
            padding: '4px 10px', background: '#5a3a3a', color: '#ddd',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
          Stop
        </button>
        <span style={{ color: '#998', fontSize: 11 }}>Speed:</span>
        <input type="range" min={0.1} max={3} step={0.1} value={sceneRef.current?.speed ?? 1}
          onChange={(e) => { if (sceneRef.current) sceneRef.current.speed = +e.target.value; }}
          style={{ width: 60 }} />
        <span style={{ color: '#9ad', fontSize: 10, width: 30 }}>
          {(sceneRef.current?.speed ?? 1).toFixed(1)}x
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={handleNewProject}
          style={{
            padding: '4px 10px', background: '#3a2a2a', color: '#ddd',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>New</button>
        <button onClick={handleLoadJSON}
          style={{
            padding: '4px 10px', background: '#3a3a5a', color: '#ddd',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
          {jsonLoaded || 'Load JSON'}
        </button>
        <button onClick={handleExportJSON}
          style={{
            padding: '4px 10px', background: '#3a3a6a', color: '#ddd',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
          {copied === 'json' ? 'OK Copied' : 'Export JSON'}
        </button>
        <button onClick={handleExportModule}
          style={{
            padding: '4px 10px', background: '#3a5a3a', color: '#ddd',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
          {copied === 'module' ? 'OK Copied' : 'Copy .ts Module'}
        </button>
        <button onClick={handleExportRigSnippet}
          style={{
            padding: '4px 10px', background: '#5a4a2a', color: '#ddd',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
          {copied === 'rig' ? 'OK Copied' : 'Copy Rig Snippet'}
        </button>
        <button onClick={handleExportSnippet}
          style={{
            padding: '4px 10px', background: '#3a2f6a', color: '#ddd',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
          {copied === 'snippet' ? 'OK Copied' : 'Copy Pose'}
        </button>
        <button onClick={handleToggleMug}
          style={{
            padding: '4px 10px', background: mugOn ? '#8a5a2e' : '#3a2a1a', color: '#ddd',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
          {mugOn ? 'Mug ON' : 'Mug'}
        </button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPoseMenuOpen((v) => !v)}
            style={{
              padding: '4px 10px', background: '#2a4a3a', color: '#ddd',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}>
            Game Poses ▾
          </button>
          {poseMenuOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 2,
              background: '#1a1612', border: '1px solid #553', borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.6)', zIndex: 100,
              minWidth: 120, padding: 2,
            }}>
              {GAME_PRESETS.map((p) => (
                <button key={p.name} onClick={() => handleLoadGamePose(p)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '5px 10px', background: 'transparent', color: '#e8e2d6',
                    border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2418'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div ref={hostRef} style={{ flex: 1, position: 'relative', minHeight: 0 }} />

        <div style={{
          width: 320, height: '100%', overflowY: 'auto', padding: 10,
          borderLeft: '1px solid #443', background: 'rgba(20,17,13,0.95)',
          zIndex: 50,
        }}>
          <div style={{
            fontWeight: 700, color: '#ffd98a', marginTop: 4, marginBottom: 6,
            borderBottom: '1px solid #443', paddingBottom: 2, fontSize: 12,
          }}>
            Animation Clips
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {project.clips.map((clip, i) => (
              <button key={i} onClick={() => setActiveClip(i)}
                style={{
                  padding: '3px 8px', borderRadius: 4, border: '1px solid',
                  background: activeClipIdx === i ? '#3a2f6a' : '#222',
                  color: activeClipIdx === i ? '#ffd98a' : '#998',
                  borderColor: activeClipIdx === i ? '#6a5acd' : '#443',
                  fontSize: 11, cursor: 'pointer',
                }}>
                {clip.name}
              </button>
            ))}
            <button onClick={handleAddClip}
              style={{ padding: '3px 6px', background: '#2a2a3a', color: '#9af', border: '1px dashed #556', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
              + Add
            </button>
            {project.clips.length > 1 && (
              <button onClick={handleDeleteClip}
                style={{ padding: '3px 6px', background: '#3a2a2a', color: '#faa', border: '1px solid #543', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
                Del
              </button>
            )}
          </div>

          <CharacterSelector current={project.modelType} onSelect={handleSelectModel} />

          {activeClip && selectedKfIdx < activeClip.keyframes.length && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                fontWeight: 700, color: '#ffd98a', borderBottom: '1px solid #443',
                paddingBottom: 2, fontSize: 12,
              }}>
                Keyframe {selectedKfIdx}
                <span style={{ color: '#998', fontWeight: 400, marginLeft: 8 }}>
                  t={activeClip.keyframes[selectedKfIdx]?.time.toFixed(2)}s
                </span>
              </div>
              <button onClick={() => {
                if (activeClip) {
                  const kf = activeClip.keyframes[selectedKfIdx];
                  setJointValues(clonePose(kf.joints));
                  if (sceneRef.current) sceneRef.current.applyPose(kf.joints);
                }
              }}
              style={{
                marginTop: 4, padding: '2px 8px', background: '#333',
                color: '#ddd', border: '1px solid #555', borderRadius: 4,
                cursor: 'pointer', fontSize: 11,
              }}>
                Snap to this frame
              </button>
              {sceneRef.current && (
                <button onClick={() => {
                  if (!sceneRef.current || !activeClip) return;
                  const cv = clonePose(sceneRef.current.jointValues as any);
                  updateClip((clip) => {
                    const kfs = [...clip.keyframes];
                    kfs[selectedKfIdx] = { ...kfs[selectedKfIdx], joints: cv };
                    return { ...clip, keyframes: kfs };
                  });
                }}
                style={{
                  marginTop: 4, marginLeft: 4, padding: '2px 8px', background: '#4a3a2a',
                  color: '#ffd98a', border: '1px solid #8a7a5a', borderRadius: 4,
                  cursor: 'pointer', fontSize: 11,
                }}>
                  Overwrite from view
                </button>
              )}
            </div>
          )}

          <JointPanel joints={jointValues} grabbed={grabbed} onJointChange={setJointAxis} />
        </div>
      </div>

      {activeClip && (
        <Timeline
          clip={activeClip}
          playTime={playTime}
          isPlaying={isPlaying}
          selectedKfIdx={selectedKfIdx}
          onScrub={handleScrub}
          onSelectKeyframe={selectKeyframe}
          onMoveKeyframe={handleMoveKeyframe}
          onDeleteKeyframe={deleteKeyframe}
          onChangeDuration={(dur) => updateClip((c) => ({ ...c, duration: dur }))}
          onToggleLoop={() => updateClip((c) => ({ ...c, loop: !c.loop }))}
          onAddKeyframe={addKeyframe}
        />
      )}
    </div>
  );
}